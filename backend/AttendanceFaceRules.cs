public static class FaceEnrollment
{
    // Employees may be provisioned before enrollment. Attendance requires a usable photo.
    public static FaceVerificationResult? Validate(string? photo, FaceVerificationService faces)
    {
        if (string.IsNullOrWhiteSpace(photo)) return null;
        byte[] bytes;
        try { bytes = Guard.Photo(photo); }
        catch (RuleException) {
            return new("reference_invalid", "Use a clear JPEG reference photo under 3 MB.",
                null, "reference_encoding", FaceVerificationService.ModelId);
        }
        var result = faces.ValidateReference(bytes);
        return result.Decision == "match" ? null : result;
    }

    public static IResult Failure(FaceVerificationResult result)
    {
        int status = result.Decision switch {
            "unavailable" => 503,
            "reference_missing" or "reference_invalid" => 409,
            _ => 422
        };
        return Results.Json(new {
            error = result.Message,
            code = "face_" + result.Decision,
            verification = result
        }, statusCode: status);
    }
}

public static class AttendanceIdentity
{
    public static Employee? Resolve(IEnumerable<Employee> employees, string user, string email,
        string? requestedUser, bool demo)
    {
        bool Owns(Employee e) => string.Equals(e.UserId, user, StringComparison.OrdinalIgnoreCase)
            || string.Equals(e.Id.ToString(), user, StringComparison.OrdinalIgnoreCase)
            || (string.IsNullOrWhiteSpace(e.UserId) &&
                string.Equals(e.Email, email, StringComparison.OrdinalIgnoreCase));
        bool Requested(Employee e) => string.Equals(e.UserId, requestedUser, StringComparison.OrdinalIgnoreCase)
            || string.Equals(e.Id.ToString(), requestedUser, StringComparison.OrdinalIgnoreCase);

        var list = employees.ToList();
        if (string.IsNullOrWhiteSpace(requestedUser)) return list.FirstOrDefault(Owns);
        var selected = list.FirstOrDefault(Requested);
        if (selected != null && (demo || Owns(selected))) return selected;
        throw new RuleException("You can only mark attendance for your signed-in account.", 403);
    }
}
