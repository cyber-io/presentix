using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using OpenCvSharp;

int passed=0;
void Check(bool condition,string name){if(!condition)throw new Exception(name);Console.WriteLine("PASS "+name);passed++;}
void Reject(Action action,string name){try{action();throw new Exception("Accepted invalid input: "+name);}catch(RuleException){Console.WriteLine("PASS "+name);passed++;}}
var valid=new Submission(Guid.NewGuid(),"CHECK_IN",12.9716,77.5946,5,DateTimeOffset.UtcNow,"");
Guard.Position(valid);
Check(Guard.Distance(0,0,0,0)==0,"identical GPS points");
Check(Math.Abs(Guard.Distance(0,0,0,1)-111195)<2,"known equatorial distance");
Reject(()=>Guard.Position(valid with{Latitude=91}),"latitude range");
Reject(()=>Guard.Position(valid with{Longitude=double.NaN}),"non-finite coordinate");
Reject(()=>Guard.Position(valid with{AccuracyMeters=0}),"zero accuracy");
Reject(()=>Guard.Position(valid with{AccuracyMeters=101}),"poor accuracy");
Reject(()=>Guard.Position(valid with{CapturedAt=DateTimeOffset.UtcNow.AddMinutes(-2)}),"stale location");
Reject(()=>Guard.Position(valid with{CapturedAt=DateTimeOffset.UtcNow.AddMinutes(2)}),"future location");
Reject(()=>Guard.Photo("https://example.com/fake.jpg"),"remote photo URL");
Reject(()=>Guard.Photo("data:image/jpeg;base64,INVALID"),"malformed base64");
Reject(()=>Guard.Photo("data:image/jpeg;base64,"+Convert.ToBase64String(new byte[100])),"non-JPEG bytes");
Reject(()=>Guard.Office(new Office(Guid.NewGuid(),"", "Address",0,0,150)),"empty office name");
Reject(()=>Guard.Office(new Office(Guid.NewGuid(),"Office", "Address",0,0,1001)),"excessive geofence");
var validEmp=new EmployeeInput("John Doe","john@present.local","Engineer",5000m,"INR");
Guard.Employee(validEmp);
Check(validEmp.MonthlySalary==5000m,"employee salary valid");
Reject(()=>Guard.Employee(validEmp with{Name=""}),"empty employee name");
Reject(()=>Guard.Employee(validEmp with{Email="invalid-email"}),"invalid employee email");
Reject(()=>Guard.Employee(validEmp with{MonthlySalary=-100m}),"negative employee salary");

// Production attendance identity is resolved from the signed-in account, not an
// arbitrary client-provided employee ID. Demo emulation is tested separately.
var ownEmployee = new Employee(Guid.NewGuid(), "auth-owner", "Owner", "owner@example.test", "Engineer", 1000m, "INR", DateTimeOffset.UtcNow);
var otherEmployee = new Employee(Guid.NewGuid(), "auth-other", "Other", "other@example.test", "Engineer", 1000m, "INR", DateTimeOffset.UtcNow);
var roster = new[] { ownEmployee, otherEmployee };
Check(AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, "auth-owner", false) == ownEmployee,
    "signed-in account ID selects its own employee");
Check(AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, ownEmployee.Id.ToString(), false) == ownEmployee,
    "own roster employee ID is an accepted alias");
Check(AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, "  ", false) == ownEmployee,
    "blank requested identity resolves the signed-in employee");
void Forbidden(Action action, string name)
{
    try { action(); throw new Exception("Accepted forbidden attendance identity: " + name); }
    catch (RuleException e) { Check(e.Status == 403, name); }
}
Forbidden(() => AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, "auth-other", false),
    "another account cannot be selected for production attendance");
Forbidden(() => AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, otherEmployee.Id.ToString(), false),
    "another roster ID cannot bypass attendance account binding");
Forbidden(() => AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, "unknown-account", false),
    "unknown requested identity is denied with 403");
Check(AttendanceIdentity.Resolve(roster, "auth-owner", ownEmployee.Email, "auth-other", true) == otherEmployee,
    "explicit demo mode permits employee emulation");
var unlinked = ownEmployee with { Id = Guid.NewGuid(), UserId = null, Email = "unlinked@example.test" };
Check(AttendanceIdentity.Resolve([unlinked], "new-auth", "UNLINKED@example.test", null, false) == unlinked,
    "email fallback supports an unlinked employee case-insensitively");
var linkedElsewhere = unlinked with { UserId = "different-auth" };
Check(AttendanceIdentity.Resolve([linkedElsewhere], "new-auth", unlinked.Email, null, false) is null,
    "email fallback cannot claim an employee linked to another account");
Forbidden(() => AttendanceIdentity.Resolve([linkedElsewhere], "new-auth", unlinked.Email, linkedElsewhere.Id.ToString(), false),
    "requested roster ID plus email cannot claim another linked account");
Check(AttendanceIdentity.Resolve(roster, "unknown-auth", "nobody@example.test", null, false) is null,
    "unknown signed-in account has no attendance identity");

// These checks use isolated configuration and public OpenCV sample images only.
// No employee files, Supabase credentials or attendance records are loaded.
var backendRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../backend"));
FaceVerificationService Service(Dictionary<string, string?>? overrides = null, string? contentRoot = null)
{
    var settings = overrides ?? new Dictionary<string, string?>();
    var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
    return new FaceVerificationService(configuration,
        new TestEnvironment(contentRoot ?? backendRoot), NullLogger<FaceVerificationService>.Instance);
}

using (var missingModels = Service(contentRoot: Path.Combine(backendRoot, "missing-model-fixtures")))
{
    Check(!missingModels.GetStatus().Available, "missing models report unavailable");
    var unavailable = missingModels.Verify([1, 2, 3], [1, 2, 3]);
    Check(unavailable.Decision == "unavailable" && unavailable.Similarity is null,
        "missing models cannot approve or reject an identity");
    Check(missingModels.ValidateReference([1, 2, 3]).Decision == "unavailable",
        "enrollment also fails closed without models");
}
try
{
    using var invalid = Service(new() {
        ["FaceVerification:RejectThreshold"] = "0.5",
        ["FaceVerification:AcceptThreshold"] = "0.4"
    });
    throw new Exception("Accepted inverted recognition thresholds.");
}
catch (ArgumentException) { Check(true, "inverted recognition thresholds rejected"); }

var fixtures = args.FirstOrDefault() ?? Environment.GetEnvironmentVariable("FACETEST_FIXTURES");
if (string.IsNullOrWhiteSpace(fixtures))
{
    Console.WriteLine("SKIP face inference fixtures: pass a directory containing public lena.jpg and messi5.jpg, or set FACETEST_FIXTURES.");
}
else
{
    using var verifier = Service();
    var status = verifier.GetStatus();
    Check(status.Available, "native face engine and model files load: " + status.State);
    var lena = File.ReadAllBytes(Path.Combine(fixtures, "lena.jpg"));
    var messiPath = Path.Combine(fixtures, "messi5.jpg");
    if (!File.Exists(messiPath)) messiPath = Path.Combine(fixtures, "messi.jpg");
    var messi = PreparePortrait(File.ReadAllBytes(messiPath), backendRoot);

    Check(verifier.ValidateReference(lena).Decision == "match", "clear reference portrait accepted");
    var same = verifier.Verify(lena, lena);
    Check(same.Decision == "match" && same.Similarity is > 0.99,
        "same portrait matches with a cosine score, not a percentage");

    using var original = Cv2.ImDecode(lena, ImreadModes.Color);
    using var smaller = new Mat();
    using var brighter = new Mat();
    Cv2.Resize(original, smaller, new Size(420, 420), 0, 0, InterpolationFlags.Area);
    smaller.ConvertTo(brighter, MatType.CV_8UC3, 0.95, 8);
    Cv2.ImEncode(".jpg", brighter, out var transformed);
    var varied = verifier.Verify(transformed, lena);
    Check(varied.Decision == "match", "same face still matches after modest resize and lighting change");

    var different = verifier.Verify(messi, lena);
    Check(different.Decision == "mismatch" && different.Similarity is not null,
        "different public portraits are rejected");
    Console.WriteLine($"Fixture cosine scores: same={same.Similarity:F4}, transformed={varied.Similarity:F4}, different={different.Similarity:F4}");

    using var blank = new Mat(512, 512, MatType.CV_8UC3, new Scalar(128, 128, 128));
    Cv2.ImEncode(".jpg", blank, out var noFace);
    var missing = verifier.Verify(noFace, lena);
    Check(missing.Decision == "retake" && missing.Reason == "no_face", "no face requests a retake");
    Check(verifier.Verify([1, 2, 3], lena).Decision == "retake", "corrupt capture requests a retake");
    Check(verifier.Verify(lena, noFace).Decision == "reference_invalid", "invalid enrolled photo is distinguished from mismatch");

    using var montage = new Mat(original.Rows, original.Cols * 2, original.Type());
    using (var left = new Mat(montage, new Rect(0, 0, original.Cols, original.Rows))) original.CopyTo(left);
    using (var right = new Mat(montage, new Rect(original.Cols, 0, original.Cols, original.Rows))) original.CopyTo(right);
    Cv2.ImEncode(".jpg", montage, out var groupPhoto);
    var multiple = verifier.Verify(groupPhoto, lena);
    Check(multiple.Decision == "retake" && multiple.Reason == "multiple_faces", "multiple faces request a retake");

    var measured = varied.Similarity ?? throw new Exception("Missing transformed fixture score.");
    var reject = Math.Max(-1, measured - 0.01);
    var accept = Math.Min(1, measured + 0.01);
    using (var reviewVerifier = Service(new() {
        ["FaceVerification:RejectThreshold"] = reject.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        ["FaceVerification:AcceptThreshold"] = accept.ToString("R", System.Globalization.CultureInfo.InvariantCulture)
    }))
    {
        Check(reviewVerifier.Verify(transformed, lena).Decision == "review",
            "a score between the configured thresholds requests review");
    }
}
Console.WriteLine($"{passed} checks passed.");

// The sports sample contains a small face. Crop the public fixture to exercise identity
// comparison separately from the production minimum-face-size guard.
static byte[] PreparePortrait(byte[] jpeg, string backendRoot)
{
    using var image = Cv2.ImDecode(jpeg, ImreadModes.Color);
    using var detector = FaceDetectorYN.Create(
        Path.Combine(backendRoot, "Models/face_detection_yunet_2023mar.onnx"), "", image.Size());
    using var faces = new Mat();
    detector.Detect(image, faces);
    var faceCount = faces.Rows;
    if (faceCount == 0) throw new Exception("No face detected in the different-person public fixture.");
    var best = 0;
    for (var row = 1; row < faceCount; row++)
        if (faces.At<float>(row, 2) * faces.At<float>(row, 3) > faces.At<float>(best, 2) * faces.At<float>(best, 3)) best = row;
    var x = faces.At<float>(best, 0);
    var y = faces.At<float>(best, 1);
    var w = faces.At<float>(best, 2);
    var h = faces.At<float>(best, 3);
    var side = Math.Max(w, h) * 1.8;
    var left = Math.Max(0, (int)Math.Floor(x + w / 2 - side / 2));
    var top = Math.Max(0, (int)Math.Floor(y + h / 2 - side / 2));
    var width = Math.Min(image.Cols - left, (int)Math.Ceiling(side));
    var height = Math.Min(image.Rows - top, (int)Math.Ceiling(side));
    using var crop = new Mat(image, new Rect(left, top, width, height));
    using var portrait = new Mat();
    Cv2.Resize(crop, portrait, new Size(512, 512), 0, 0, InterpolationFlags.Cubic);
    Cv2.ImEncode(".jpg", portrait, out var result);
    return result;
}

sealed class TestEnvironment(string root) : IHostEnvironment
{
    public string ApplicationName { get; set; } = "AttendanceChecks";
    public string EnvironmentName { get; set; } = Environments.Development;
    public string ContentRootPath { get; set; } = root;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
