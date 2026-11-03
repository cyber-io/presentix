# Face verification in Present

The existing ASP.NET Core 10 attendance flow now compares face identity using OpenCvSharp 5, YuNet face detection, and SFace recognition. The existing React enrollment and attendance screens call the API; they no longer make image-matching decisions in JavaScript.

## Run

1. From the project folder, run `dotnet build backend` and `npm --prefix frontend run build`.
2. Restart your API and frontend using your existing launch workflow (`./start.sh`, or `./start-demo.sh` for Development demo mode).
3. In the administrator Employee Salary Sheet, add or edit an employee and capture/upload a clear reference face photo. The server checks that exactly one sufficiently clear face is present before accepting a new reference. Existing reference photos are checked at attendance time.
4. Sign in as that employee, verify GPS, capture a fresh photo, and confirm check-in or check-out. The server must return a match before the attendance write runs.

The bundled models and their licenses live in `backend/Models`. They are copied on build and publish. `sources.json` records download sources, sizes and SHA-256 hashes. The managed/native OpenCvSharp package versions are pinned together. The project selects a full native runtime for macOS, Windows, or glibc Linux based on the SDK/runtime identifier; slim runtimes do not include DNN support. For cross-publishing, pass the destination RID, for example `dotnet publish backend -c Release -r linux-x64`.

## Where the implementation lives

| File | Responsibility |
| --- | --- |
| `backend/FaceVerification.cs` | Bounded JPEG decoding, face detection/alignment, quality checks, embeddings, cosine comparison, model loading and synchronized native inference. |
| `backend/AttendanceFaceRules.cs` | Structured failures, reference-photo validation and binding an attendance request to the signed-in employee. |
| `backend/Program.cs` | Dependency registration, employee enrollment validation, attendance gate and status response. |
| `frontend/src/App.jsx` | Camera/reference capture, API requests, match confirmation, mismatch dialog and retake/review messages. |

Reference enrollment is an administrator action. Regular self-profile edits retain the registered reference. In production, the requested employee must belong to the signed-in account; selecting another employee remains a Development demo feature.

## Decisions and API responses

`POST /api/attendance` keeps its existing JSON request body. The client supplies its capture, never a trusted match result. On success the attendance response includes:

```json
{
  "face_verification": {
    "decision": "match",
    "message": "Face matched the registered photo.",
    "similarity": 0.72,
    "reason": "accepted",
    "model": "sface-2021dec"
  }
}
```

That score is illustrative, not an identity probability. Face metadata is returned with the successful submission; it is not added to the existing attendance database schema/history.

Failures contain `error`, `code` (such as `face_retake`), and `verification` with the same result shape.

| Decision | HTTP | Action |
| --- | --- | --- |
| `mismatch` | 422 | No attendance write; retry or request manual verification. |
| `review` | 422 | Score lies between thresholds; retake or request manual verification. |
| `retake` | 422 | No face, multiple faces, too small, blur, lighting or invalid capture. |
| `reference_missing` / `reference_invalid` | 409 | Administrator must enroll or replace the reference. |
| `unavailable` | 503 | Models/native engine are unavailable; attendance fails closed. |

`GET /api/status` includes `face_verification.available`, `state`, `model` and configured thresholds. Missing files can become available after placing the models in the configured folder. A model/native/inference engine failure requires fixing the issue and restarting the API.

## Configuration and practical limits

```json
"FaceVerification": {
  "DetectorModel": "Models/face_detection_yunet_2023mar.onnx",
  "RecognitionModel": "Models/face_recognition_sface_2021dec.onnx",
  "RejectThreshold": 0.30,
  "AcceptThreshold": 0.45
}
```

These cosine thresholds are preliminary. Higher means more similar; scores at or below the reject threshold produce mismatch, scores at or above the accept threshold produce match, and scores between them produce review. Before production reliance, calibrate with held-out same-person and different-person captures from intended cameras and lighting, choosing acceptable false-accept and false-reject rates. The fixture tests verify integration, not workplace accuracy.

Optional quality settings include `MinimumFaceSize` (80 pixels after detection resizing), `MinimumBlurVariance` (20), `MinimumMeanBrightness` (30), `MaximumMeanBrightness` (225), `MaximumDecodedPixels` (16,000,000), `MaximumImageBytes` (4,000,000) and `MaximumDetectionSize` (1280). The attendance API retains its existing JPEG-under-3-MB limit. Model/version changes require revalidating thresholds and references.

Camera capture and face matching do not establish liveness. A printed photo, replay or injected image can still pass recognition. Connect a liveness provider and validate its server-side, session-bound result before enabling any liveness claim. Existing manual attendance corrections remain the available administrator workflow for exceptions.

## Validation

```sh
dotnet build backend
dotnet run --project tests
npm --prefix frontend run build
```

The test console runs guards, authenticated employee binding and missing-model checks without employee data or cloud connections. To exercise actual recognition, supply a separate fixture directory containing the official OpenCV `lena.jpg` and `messi5.jpg` sample files:

```sh
dotnet run --project tests -- /absolute/path/to/face-fixtures
python3 tests/api_smoke.py http://127.0.0.1:5091 /absolute/path/to/face-fixtures
```

The HTTP suite requires a separate empty Development demo server and Python Pillow. It creates only test data in that server; run it in an isolated checkout. It refuses non-local URLs and nonempty stores. Never run fixture writes against your existing employee data.

Official references:
- https://github.com/shimat/opencvsharp
- https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html
- https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
- https://github.com/opencv/opencv/tree/master/samples/data
