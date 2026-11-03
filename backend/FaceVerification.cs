using OpenCvSharp;
using SkiaSharp;

public sealed class FaceVerificationOptions
{
    public string DetectorModel { get; set; } = "Models/face_detection_yunet_2023mar.onnx";
    public string RecognitionModel { get; set; } = "Models/face_recognition_sface_2021dec.onnx";
    public string Model { get; set; } = FaceVerificationService.ModelId;
    // Preliminary values: calibrate against held-out captures before production use.
    public double RejectThreshold { get; set; } = 0.30;
    public double AcceptThreshold { get; set; } = 0.45;
    public int MinimumFaceSize { get; set; } = 80;
    public double MinimumBlurVariance { get; set; } = 20;
    public double MinimumMeanBrightness { get; set; } = 30;
    public double MaximumMeanBrightness { get; set; } = 225;
    public int MaximumDecodedPixels { get; set; } = 16_000_000;
    public int MaximumImageBytes { get; set; } = 4_000_000;
    public int MaximumDetectionSize { get; set; } = 1280;
}

public sealed record FaceVerificationResult(
    string Decision, string Message, double? Similarity, string Reason, string Model);

public sealed record FaceVerificationStatus(
    bool Available, string State, string Message, string Model,
    double RejectThreshold, double AcceptThreshold, bool PreliminaryThresholds);

/// <summary>One-to-one face comparison only; this service does not establish liveness.</summary>
public sealed class FaceVerificationService : IDisposable
{
    public const string ModelId = "sface-2021dec";
    private readonly object _gate = new();
    private readonly FaceVerificationOptions _options;
    private readonly string _detectorPath;
    private readonly string _recognizerPath;
    private readonly ILogger<FaceVerificationService> _logger;
    private FaceDetectorYN? _detector;
    private FaceRecognizerSF? _recognizer;
    private string _failureReason = "models_missing";
    private bool _reportedFailure;
    private bool _engineFailed;
    private bool _disposed;

    public FaceVerificationService(IConfiguration config, IHostEnvironment environment,
        ILogger<FaceVerificationService> logger)
    {
        _options = config.GetSection("FaceVerification").Get<FaceVerificationOptions>() ?? new();
        _logger = logger;
        if (!double.IsFinite(_options.RejectThreshold) || !double.IsFinite(_options.AcceptThreshold)
            || _options.RejectThreshold < -1 || _options.AcceptThreshold > 1
            || _options.RejectThreshold >= _options.AcceptThreshold)
            throw new ArgumentException("FaceVerification thresholds must satisfy -1 <= RejectThreshold < AcceptThreshold <= 1.");
        if (_options.MinimumFaceSize < 1 || _options.MaximumDetectionSize < _options.MinimumFaceSize
            || _options.MaximumDetectionSize > 4096 || _options.MaximumDecodedPixels < 1
            || _options.MaximumDecodedPixels > 32_000_000 || _options.MaximumImageBytes < 1
            || _options.MaximumImageBytes > 10_000_000 || !double.IsFinite(_options.MinimumBlurVariance)
            || _options.MinimumBlurVariance < 0 || !double.IsFinite(_options.MinimumMeanBrightness)
            || !double.IsFinite(_options.MaximumMeanBrightness) || _options.MinimumMeanBrightness < 0
            || _options.MaximumMeanBrightness > 255
            || _options.MinimumMeanBrightness >= _options.MaximumMeanBrightness)
            throw new ArgumentException("FaceVerification image quality limits are invalid.");
        _detectorPath = Path.GetFullPath(_options.DetectorModel, environment.ContentRootPath);
        _recognizerPath = Path.GetFullPath(_options.RecognitionModel, environment.ContentRootPath);
    }

    public FaceVerificationStatus GetStatus()
    {
        lock (_gate)
        {
            var available = EnsureLoaded();
            return new(available, available ? "ready" : _failureReason,
                available ? "Face comparison is available." : "Face comparison is unavailable. Contact an administrator.",
                _options.Model, _options.RejectThreshold, _options.AcceptThreshold, true);
        }
    }

    public FaceVerificationResult Verify(byte[] captured, byte[] reference)
    {
        lock (_gate)
        {
            if (!EnsureLoaded()) return Unavailable();
            try
            {
                using var referenceFeature = ExtractFeature(reference, true);
                using var capturedFeature = ExtractFeature(captured, false);
                var score = _recognizer!.Match(referenceFeature, capturedFeature, FaceRecognizerSFDisType.Cosine);
                if (!double.IsFinite(score)) return Result("unavailable", "Face comparison did not produce a valid result.", null, "invalid_score");
                if (score >= _options.AcceptThreshold)
                    return Result("match", "Face matched the registered photo.", score, "accepted");
                if (score <= _options.RejectThreshold)
                    return Result("mismatch", "Face did not match the registered photo. Retry or request manual verification.", score, "below_threshold");
                return Result("review", "The result is uncertain. Retake the photo or request manual verification.", score, "uncertain");
            }
            catch (ImageRejectedException ex) { return Result(ex.Decision, ex.Message, null, ex.Reason); }
            catch (Exception ex) { ReportFailure(ex); return Unavailable(); }
        }
    }

    public FaceVerificationResult ValidateReference(byte[] reference)
    {
        lock (_gate)
        {
            if (!EnsureLoaded()) return Unavailable();
            try
            {
                using var feature = ExtractFeature(reference, true);
                return Result("match", "The photo is usable for face comparison.", null, "reference_usable");
            }
            catch (ImageRejectedException ex) { return Result(ex.Decision, ex.Message, null, ex.Reason); }
            catch (Exception ex) { ReportFailure(ex); return Unavailable(); }
        }
    }

    private Mat ExtractFeature(byte[] bytes, bool reference)
    {
        void Reject(string message, string reason) => throw new ImageRejectedException(
            reference ? "reference_invalid" : "retake", message, reason);
        if (bytes is null || bytes.Length == 0 || bytes.Length > _options.MaximumImageBytes)
            Reject("Provide a JPEG photo within the configured image size limit.", "image_size");

        // Inspect encoded dimensions before asking OpenCV to allocate a decoded image.
        using var data = SKData.CreateCopy(bytes!);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.EncodedFormat != SKEncodedImageFormat.Jpeg)
            Reject("Provide a valid JPEG photo.", "invalid_image");
        var info = codec!.Info;
        if (info.Width <= 0 || info.Height <= 0 || info.Width > 8192 || info.Height > 8192
            || (long)info.Width * info.Height > _options.MaximumDecodedPixels)
            Reject("The photo dimensions exceed the image size limit.", "image_dimensions");

        using var decoded = DecodeImage(bytes!, reference);
        if (decoded.Empty() || (long)decoded.Width * decoded.Height > _options.MaximumDecodedPixels)
            Reject("The photo could not be decoded.", "invalid_image");
        using var image = new Mat();
        var scale = Math.Min(1d, (double)_options.MaximumDetectionSize / Math.Max(decoded.Width, decoded.Height));
        Cv2.Resize(decoded, image, new Size(Math.Max(1, (int)Math.Round(decoded.Width * scale)),
            Math.Max(1, (int)Math.Round(decoded.Height * scale))), 0, 0, InterpolationFlags.Area);
        using var faces = new Mat();
        _detector!.SetInputSize(image.Size());
        _detector.Detect(image, faces);
        if (faces.Rows != 1)
            Reject(faces.Rows == 0 ? "No clear face was found. Face the camera and retake the photo."
                : "Only one person may appear in the photo.", faces.Rows == 0 ? "no_face" : "multiple_faces");
        if (Math.Min(faces.At<float>(0, 2), faces.At<float>(0, 3)) < _options.MinimumFaceSize)
            Reject("Move closer to the camera and retake the photo.", "face_too_small");

        using var face = faces.Row(0);
        using var aligned = new Mat();
        using var gray = new Mat();
        using var laplacian = new Mat();
        _recognizer!.AlignCrop(image, face, aligned);
        Cv2.CvtColor(aligned, gray, ColorConversionCodes.BGR2GRAY);
        var brightness = Cv2.Mean(gray).Val0;
        if (brightness < _options.MinimumMeanBrightness || brightness > _options.MaximumMeanBrightness)
            Reject("Use even lighting on your face and retake the photo.", "poor_lighting");
        Cv2.Laplacian(gray, laplacian, MatType.CV_64F);
        Cv2.MeanStdDev(laplacian, out Scalar _, out Scalar deviation);
        if (deviation.Val0 * deviation.Val0 < _options.MinimumBlurVariance)
            Reject("The face appears blurred. Hold the camera steady and retake the photo.", "blurred_face");
        using var rawFeature = new Mat();
        _recognizer.Feature(aligned, rawFeature);
        return rawFeature.Clone();
    }

    private static Mat DecodeImage(byte[] bytes, bool reference)
    {
        try { return Cv2.ImDecode(bytes, ImreadModes.Color); }
        catch (OpenCVException)
        {
            throw new ImageRejectedException(reference ? "reference_invalid" : "retake",
                "The photo could not be decoded. Provide a valid JPEG photo.", "invalid_image");
        }
    }

    private bool EnsureLoaded()
    {
        if (_disposed) { _failureReason = "service_unavailable"; return false; }
        if (_engineFailed) return false;
        if (_detector is not null && _recognizer is not null) return true;
        if (!File.Exists(_detectorPath) || !File.Exists(_recognizerPath))
        { _failureReason = "models_missing"; return false; }
        try
        {
            _detector = FaceDetectorYN.Create(_detectorPath, "", new Size(320, 320));
            _recognizer = FaceRecognizerSF.Create(_recognizerPath, "");
            _reportedFailure = false;
            return true;
        }
        catch (Exception ex) { ReportFailure(ex); return false; }
    }

    private void ReportFailure(Exception ex)
    {
        _failureReason = "engine_unavailable";
        _engineFailed = true; // Native/model failures require an administrator fix and service restart.
        _recognizer?.Dispose();
        _detector?.Dispose();
        _recognizer = null;
        _detector = null;
        if (!_reportedFailure) _logger.LogError(ex, "Face comparison engine failed; no attendance decision was made.");
        _reportedFailure = true;
    }

    private FaceVerificationResult Unavailable() => Result("unavailable",
        "Face comparison is unavailable. Contact an administrator for manual verification.", null, _failureReason);
    private FaceVerificationResult Result(string decision, string message, double? score, string reason)
        => new(decision, message, score, reason, _options.Model);

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            _recognizer?.Dispose();
            _detector?.Dispose();
        }
    }

    private sealed class ImageRejectedException(string decision, string message, string reason) : Exception(message)
    {
        public string Decision { get; } = decision;
        public string Reason { get; } = reason;
    }
}
