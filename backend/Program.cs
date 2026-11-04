using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

// Configuration is loaded at startup; restart the API after changing settings.
// Avoid filesystem watchers in constrained desktop/container environments.
Environment.SetEnvironmentVariable("DOTNET_HOSTBUILDER__RELOADCONFIGONCHANGE", "false");
var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 4_000_000);
builder.Services.AddHttpClient();
builder.Services.AddSingleton<Store>();
builder.Services.AddSingleton<FaceVerificationService>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(builder.Configuration["FrontendOrigin"] ?? "http://127.0.0.1:5173").AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(o => { o.RejectionStatusCode = 429; o.AddFixedWindowLimiter("writes", x => { x.PermitLimit = 30; x.Window = TimeSpan.FromMinutes(1); }); });
var app = builder.Build();
var demo = builder.Configuration.GetValue<bool>("DemoMode");
if (demo && !app.Environment.IsDevelopment()) throw new InvalidOperationException("DemoMode is restricted to Development.");
if (!demo && (string.IsNullOrWhiteSpace(builder.Configuration["Supabase:Url"]) || string.IsNullOrWhiteSpace(builder.Configuration["Supabase:ServiceRoleKey"])))
    throw new InvalidOperationException("Configure Supabase credentials or explicitly enable Development DemoMode.");
app.UseCors();
app.UseRateLimiter();
app.Use(async (ctx, next) => {
    ctx.Response.Headers.CacheControl = "no-store";
    try {
        if (ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Path != "/api/status" && ctx.Request.Path != "/api/forgot-password") {
            if (demo) {
                var reqUser = ctx.Request.Headers["X-Demo-User"].ToString();
                var reqRole = ctx.Request.Headers["X-Demo-Role"].ToString();
                var reqEmail = ctx.Request.Headers["X-Demo-Email"].ToString();
                var normalizedRole = !string.IsNullOrWhiteSpace(reqRole) ? reqRole.ToLowerInvariant() : "super_admin";
                if (normalizedRole == "admin") normalizedRole = "super_admin";
                if (normalizedRole == "employee") normalizedRole = "user";

                ctx.Items["user"] = !string.IsNullOrWhiteSpace(reqUser) ? reqUser : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
                ctx.Items["role"] = normalizedRole;
                ctx.Items["super_admin"] = normalizedRole == "super_admin";
                ctx.Items["admin"] = normalizedRole is "super_admin" or "manager";
                ctx.Items["email"] = !string.IsNullOrWhiteSpace(reqEmail) ? reqEmail : (normalizedRole == "user" ? "user@present.local" : normalizedRole == "manager" ? "manager@present.local" : "superadmin@present.local");
            }
            else {
                var token = ctx.Request.Headers.Authorization.ToString();
                if (!token.StartsWith("Bearer ") || token.Length < 20) { ctx.Response.StatusCode = 401; return; }
                var client = ctx.RequestServices.GetRequiredService<IHttpClientFactory>().CreateClient();
                using var request = new HttpRequestMessage(HttpMethod.Get, builder.Configuration["Supabase:Url"]!.TrimEnd('/') + "/auth/v1/user");
                request.Headers.Add("apikey", builder.Configuration["Supabase:ServiceRoleKey"]);
                request.Headers.TryAddWithoutValidation("Authorization", token);
                using var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode) { ctx.Response.StatusCode = 401; return; }
                var user = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
                var userEmail = user["email"]?.GetValue<string>()?.ToLowerInvariant() ?? "";
                var r = user["app_metadata"]?["role"]?.GetValue<string>()?.ToLowerInvariant()
                     ?? user["user_metadata"]?["role"]?.GetValue<string>()?.ToLowerInvariant()
                     ?? (userEmail.Contains("admin") ? "super_admin" : userEmail.Contains("manager") ? "manager" : "user");
                if (r == "admin") r = "super_admin";
                ctx.Items["user"] = user["id"]!.GetValue<string>();
                ctx.Items["email"] = user["email"]?.GetValue<string>() ?? "Employee";
                ctx.Items["role"] = r;
                ctx.Items["super_admin"] = r == "super_admin";
                ctx.Items["admin"] = r is "super_admin" or "manager";
            }
        }
        await next();
    } catch (RuleException e) { ctx.Response.StatusCode = e.Status; await ctx.Response.WriteAsJsonAsync(new {error = e.Message}); }
      catch (Exception e) { 
          app.Logger.LogError(e, "Request failed: {Message}", e.Message); 
          ctx.Response.StatusCode = 500; 
          var msg = e.Message;
          var inner = e.InnerException?.Message ?? "";
          if (msg.Contains("nodename nor servname") || inner.Contains("nodename nor servname") || msg.Contains("Could not resolve host") || msg.Contains("Name or service not known")) {
              msg = "Cannot connect to the cloud database (DNS/network resolution failed for Supabase). Please check your internet connection and try again.";
          }
          await ctx.Response.WriteAsJsonAsync(new {error = msg}); 
      }
});
app.MapGet("/api/status", (FaceVerificationService faces) => new {
    mode = demo ? "demo" : "supabase",
    face_verification = faces.GetStatus()
});
app.MapGet("/api/me", async (HttpContext c, Store s) => { 
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    var isAdmin = (bool)(c.Items["admin"] ?? false);
    var userId = (string)(c.Items["user"] ?? "");
    var userEmail = (string)(c.Items["email"] ?? "");
    var role = (string)(c.Items["role"] ?? (isAdmin ? "super_admin" : "user"));

    // If a staff employee was deleted from the system, immediately deny access
    if (!isSuper && !isAdmin) {
        var employees = await s.Employees();
        var emp = employees.FirstOrDefault(e => 
            e.UserId == userId || 
            e.Id.ToString() == userId || 
            (!string.IsNullOrWhiteSpace(userEmail) && string.Equals(e.Email, userEmail, StringComparison.OrdinalIgnoreCase))
        );
        if (emp == null || !emp.IsActive) {
            return Results.Json(new { error = "This employee account has been deleted by the administrator. Access is revoked." }, statusCode: 403);
        }
    }

    return Results.Ok(new { 
        id = userId, 
        email = userEmail, 
        is_admin = isAdmin, 
        role = role,
        is_super_admin = isSuper 
    });
});
app.MapGet("/api/offices", async (Store s) => await s.Offices());
app.MapPost("/api/offices", async (Office o, Store s, HttpContext c) => {
    if (!(bool)(c.Items["super_admin"] ?? false)) return Results.StatusCode(403);
    Guard.Office(o);
    return Results.Ok(await s.AddOffice(o with { Id = Guid.NewGuid() }));
}).RequireRateLimiting("writes");
app.MapPut("/api/offices/{id:guid}", async (Guid id, Office o, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    if (!isSuper && !demo) return Results.StatusCode(403);
    Guard.Office(o with { Id = id });
    var updated = await s.UpdateOffice(id, o);
    return updated != null ? Results.Ok(updated) : Results.NotFound();
}).RequireRateLimiting("writes");
app.MapDelete("/api/offices/{id:guid}", async (Guid id, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    if (!isSuper && !demo) return Results.StatusCode(403);
    var ok = await s.DeleteOffice(id);
    return ok ? Results.Ok(new { success = true }) : Results.NotFound();
}).RequireRateLimiting("writes");
app.MapPost("/api/offices/calibrate-testing", async (CalibrateInput input, Store s) => {
    if (!double.IsFinite(input.Latitude) || Math.Abs(input.Latitude) > 90 || !double.IsFinite(input.Longitude) || Math.Abs(input.Longitude) > 180)
        throw new RuleException("Invalid coordinates.");
    var offices = await s.Offices();
    var target = (input.OfficeId != null ? offices.FirstOrDefault(o => o.Id == input.OfficeId) : null)
                 ?? offices.FirstOrDefault(o => o.Name.Contains("Krishna", StringComparison.OrdinalIgnoreCase))
                 ?? offices.FirstOrDefault();
    if (target == null) return Results.NotFound();
    var radius = input.RadiusMeters.HasValue && input.RadiusMeters.Value >= 20 && input.RadiusMeters.Value <= 1000 
                 ? input.RadiusMeters.Value 
                 : Math.Max(target.RadiusMeters, 250);
    var updated = await s.UpdateOffice(target.Id, target with {
        Latitude = input.Latitude,
        Longitude = input.Longitude,
        RadiusMeters = radius
    });
    return Results.Ok(updated);
});
app.MapGet("/api/employees", async (Store s) => await s.Employees());
app.MapPost("/api/employees", async (EmployeeInput input, Store s, FaceVerificationService faces, HttpContext c) => {
    if (!(bool)(c.Items["admin"] ?? false)) return Results.StatusCode(403);
    if (string.IsNullOrWhiteSpace(input.Email))
        throw new RuleException("Please enter a valid Google email address (e.g. employee@gmail.com).");
    var email = input.Email.Trim().ToLowerInvariant();
    var password = !string.IsNullOrWhiteSpace(input.PortalPassword) ? input.PortalPassword.Trim() : Store.GeneratePassword(input.Name);
    input = input with { Email = email, PortalPassword = password };
    Guard.Employee(input);
    if (FaceEnrollment.Validate(input.PhotoBase64, faces) is { } failure)
        return FaceEnrollment.Failure(failure);
    return Results.Ok(await s.AddEmployee(input));
}).RequireRateLimiting("writes");
app.MapPost("/api/register", async (RegisterInput input, Store s, FaceVerificationService faces, HttpContext c) => {
    if (!(bool)(c.Items["admin"] ?? false)) return Results.StatusCode(403);
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
        throw new RuleException("Enter a valid name up to 100 characters.");
    if (string.IsNullOrWhiteSpace(input.Email))
        throw new RuleException("Please enter a valid Google email address (e.g. employee@gmail.com).");
    var email = input.Email.Trim().ToLowerInvariant();
    var password = !string.IsNullOrWhiteSpace(input.Password) ? input.Password.Trim() : Store.GeneratePassword(input.Name);
    var empInput = new EmployeeInput(
        input.Name.Trim(),
        email,
        string.IsNullOrWhiteSpace(input.Designation) ? "Team Member" : input.Designation.Trim(),
        input.MonthlySalary.GetValueOrDefault(0),
        string.IsNullOrWhiteSpace(input.Currency) ? "INR" : input.Currency.Trim().ToUpperInvariant(),
        null,
        input.PhotoBase64,
        password,
        true,
        input.EmployeeId,
        input.Department,
        input.Shift,
        input.JoiningDate,
        input.IsActive ?? true
    );
    Guard.Employee(empInput);
    if (FaceEnrollment.Validate(empInput.PhotoBase64, faces) is { } failure)
        return FaceEnrollment.Failure(failure);
    var created = await s.AddEmployee(empInput);
    return Results.Ok(new {
        success = true,
        employee = created,
        email = created.Email,
        password = created.PortalPassword ?? password,
        user_id = created.UserId
    });
}).RequireRateLimiting("writes");
app.MapPut("/api/employees/{id:guid}", async (Guid id, EmployeeInput input, Store s, FaceVerificationService faces, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    var isAdmin = (bool)(c.Items["admin"] ?? false);
    var currentUser = (string)c.Items["user"]!;
    var currentEmail = (string)c.Items["email"]!;

    var existing = (await s.Employees()).FirstOrDefault(e => e.Id == id);
    if (existing == null) return Results.NotFound();

    var isSelf = (Guid.TryParse(currentUser, out var uid) && uid == id) 
                 || (!string.IsNullOrEmpty(existing.UserId) && existing.UserId == currentUser)
                 || string.Equals(existing.Email, currentEmail, StringComparison.OrdinalIgnoreCase);

    if (!isSuper && !isAdmin && !isSelf) return Results.StatusCode(403);

    // After registration, NEVER allow changing employee password from super admin or manager panel:
    input = input with {
        PortalPassword = existing.PortalPassword
    };

    // If regular user (self profile edit only), strictly preserve designation, salary, currency, userId!
    if (!isSuper && !isAdmin) {
        input = input with {
            Designation = existing.Designation,
            MonthlySalary = existing.MonthlySalary,
            Currency = existing.Currency,
            UserId = existing.UserId,
            PhotoBase64 = existing.PhotoBase64
        };
    }

    Guard.Employee(input);
    if (input.PhotoBase64 != existing.PhotoBase64 &&
        FaceEnrollment.Validate(input.PhotoBase64, faces) is { } failure)
        return FaceEnrollment.Failure(failure);
    var updated = await s.UpdateEmployee(id, input);
    return updated != null ? Results.Ok(updated) : Results.NotFound();
}).RequireRateLimiting("writes");
app.MapPut("/api/me/profile", async (ProfileInput input, Store s, HttpContext c) => {
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100)
        throw new RuleException("Enter a valid name up to 100 characters.");
    if (string.IsNullOrWhiteSpace(input.Email) || input.Email.Trim().Length > 150 || !input.Email.Contains('@'))
        throw new RuleException("Enter a valid email address.");

    var currentUser = (string)c.Items["user"]!;
    var currentEmail = (string)c.Items["email"]!;
    var employees = await s.Employees();
    var existing = employees.FirstOrDefault(e => 
        (Guid.TryParse(currentUser, out var uid) && uid == e.Id) ||
        (!string.IsNullOrEmpty(e.UserId) && e.UserId == currentUser) ||
        string.Equals(e.Email, currentEmail, StringComparison.OrdinalIgnoreCase)
    ) ?? employees.FirstOrDefault();

    if (existing == null) return Results.NotFound(new { error = "Employee profile not found." });

    var updatedInput = new EmployeeInput(
        input.Name.Trim(),
        input.Email.Trim().ToLowerInvariant(),
        existing.Designation,
        existing.MonthlySalary,
        existing.Currency,
        existing.UserId,
        existing.PhotoBase64,
        existing.PortalPassword
    );
    Guard.Employee(updatedInput);
    var updated = await s.UpdateEmployee(existing.Id, updatedInput);
    return updated != null ? Results.Ok(updated) : Results.NotFound();
}).RequireRateLimiting("writes");
app.MapDelete("/api/employees/{id:guid}", async (Guid id, Store s, HttpContext c) => {
    var canDelete = (bool)(c.Items["super_admin"] ?? false) || (bool)(c.Items["admin"] ?? false);
    if (!canDelete) return Results.StatusCode(403);
    var emps = await s.Employees();
    var targetEmp = emps.FirstOrDefault(e => e.Id == id);
    var ok = await s.DeleteEmployee(id);
    if (ok && targetEmp != null) {
        var actorEmail = (string)(c.Items["email"] ?? "admin@present.local");
        var actorId = (string)(c.Items["user"] ?? "system");
        await s.AddAuditLog(actorId, actorEmail, "DELETE_EMPLOYEE", targetEmp.Name, $"Deleted employee account ({targetEmp.Email}) and all associated records from system.", null, null);
    }
    return ok ? Results.Ok(new { success = true, message = $"Employee {targetEmp?.Name} and all associated records completely deleted." }) : Results.NotFound();
}).RequireRateLimiting("writes");
app.MapPost("/api/change-password", async (ChangePasswordInput input, Store s, HttpContext c) => {
    if (string.IsNullOrWhiteSpace(input.NewPassword) || input.NewPassword.Trim().Length < 6)
        throw new RuleException("New password must be at least 6 characters.");

    var currentUser = (string)(c.Items["user"] ?? "");
    var currentEmail = (string)(c.Items["email"] ?? "");
    var list = await s.Employees();
    var emp = list.FirstOrDefault(e =>
        (!string.IsNullOrEmpty(input.UserId) && (e.UserId == input.UserId || e.Id.ToString() == input.UserId))
        || (!string.IsNullOrEmpty(currentUser) && (e.UserId == currentUser || e.Id.ToString() == currentUser))
        || (!string.IsNullOrEmpty(currentEmail) && string.Equals(e.Email, currentEmail, StringComparison.OrdinalIgnoreCase))
    );

    if (emp != null) {
        if (!string.IsNullOrWhiteSpace(input.CurrentPassword) && !string.IsNullOrWhiteSpace(emp.PortalPassword)) {
            if (!string.Equals(emp.PortalPassword, input.CurrentPassword.Trim(), StringComparison.Ordinal))
                throw new RuleException("Current password does not match.");
        }

        var updatedInput = new EmployeeInput(
            emp.Name,
            emp.Email,
            emp.Designation,
            emp.MonthlySalary,
            emp.Currency,
            emp.UserId,
            emp.PhotoBase64,
            input.NewPassword.Trim(),
            false,
            emp.EmployeeId,
            emp.Department,
            emp.Shift,
            emp.JoiningDate,
            emp.IsActive
        );
        Guard.Employee(updatedInput);
        var updated = await s.UpdateEmployee(emp.Id, updatedInput);
        if (!string.IsNullOrWhiteSpace(emp.UserId)) {
            await s.UpdateUserPassword(emp.UserId, input.NewPassword.Trim());
        }
        return Results.Ok(new { success = true, employee = updated });
    }

    if (!string.IsNullOrWhiteSpace(currentUser)) {
        await s.UpdateUserPassword(currentUser, input.NewPassword.Trim());
        return Results.Ok(new { success = true, message = "Password updated successfully." });
    }

    return Results.NotFound("Account not found.");
}).RequireRateLimiting("writes");
app.MapPost("/api/forgot-password", async (ForgotPasswordInput input, Store s) => {
    if (string.IsNullOrWhiteSpace(input.Email) || !input.Email.Contains('@'))
        throw new RuleException("Please enter a valid registered email address.");
    if (string.IsNullOrWhiteSpace(input.NewPassword) || input.NewPassword.Trim().Length < 6)
        throw new RuleException("New password must be at least 6 characters.");

    var cleanEmail = input.Email.Trim().ToLowerInvariant();
    var list = await s.Employees();
    var emp = list.FirstOrDefault(e => string.Equals(e.Email, cleanEmail, StringComparison.OrdinalIgnoreCase));

    if (emp != null) {
        if (!string.IsNullOrWhiteSpace(input.EmployeeId) && !string.IsNullOrWhiteSpace(emp.EmployeeId)) {
            if (!string.Equals(emp.EmployeeId.Trim(), input.EmployeeId.Trim(), StringComparison.OrdinalIgnoreCase)) {
                throw new RuleException("The provided Employee ID does not match this registered account.");
            }
        }

        var updatedInput = new EmployeeInput(
            emp.Name,
            emp.Email,
            emp.Designation,
            emp.MonthlySalary,
            emp.Currency,
            emp.UserId,
            emp.PhotoBase64,
            input.NewPassword.Trim(),
            false,
            emp.EmployeeId,
            emp.Department,
            emp.Shift,
            emp.JoiningDate,
            emp.IsActive
        );
        Guard.Employee(updatedInput);
        var updated = await s.UpdateEmployee(emp.Id, updatedInput);
        if (!string.IsNullOrWhiteSpace(emp.UserId)) {
            await s.UpdateUserPassword(emp.UserId, input.NewPassword.Trim());
        }
        var authId = await s.FindAuthUserIdByEmail(cleanEmail);
        if (!string.IsNullOrWhiteSpace(authId) && authId != emp.UserId) {
            await s.UpdateUserPassword(authId, input.NewPassword.Trim());
        }
        await s.AddAuditLog(emp.UserId ?? emp.Id.ToString(), emp.Email, "PASSWORD_RESET", emp.Name, "Password was reset successfully via Forgot Password on sign-in screen.", null, null);
        return Results.Ok(new { success = true, message = $"Password has been reset successfully for {emp.Name}. You can now sign in with your new password." });
    }

    var fallbackAuthId = await s.FindAuthUserIdByEmail(cleanEmail);
    if (!string.IsNullOrWhiteSpace(fallbackAuthId)) {
        await s.UpdateUserPassword(fallbackAuthId, input.NewPassword.Trim());
        await s.AddAuditLog(fallbackAuthId, cleanEmail, "PASSWORD_RESET", cleanEmail, "Password was reset successfully via Forgot Password on sign-in screen.", null, null);
        return Results.Ok(new { success = true, message = "Password has been reset successfully. You can now sign in with your new password." });
    }

    return Results.NotFound(new { error = "No registered account found with that email address." });
}).RequireRateLimiting("writes");
app.MapGet("/api/attendance/photo/{id}", async (string id, Store s) => {
    var bytes = await s.DownloadAttendancePhoto(id);
    return bytes != null ? Results.File(bytes, "image/jpeg") : Results.NotFound();
});
app.MapGet("/api/attendance", async (string? user_id, Store s, HttpContext c) => {
    var isAdmin = (bool)c.Items["admin"]!;
    var target = (isAdmin && !string.IsNullOrWhiteSpace(user_id)) ? user_id : (isAdmin ? null : (string)c.Items["user"]!);
    return await s.History(target);
});
app.MapPost("/api/attendance", async (Submission input, Store s, FaceVerificationService faces, HttpContext c) => {
    var sysSettings = await s.GetSettings();
    var maxAcc = Math.Max(sysSettings.MaxGpsAccuracy, 250);
    Guard.Position(input, maxAcc);
    var office = (await s.Offices()).SingleOrDefault(o => o.Id == input.OfficeId) ?? throw new RuleException("Office not found.", 404);
    var distance = Guard.Distance(input.Latitude, input.Longitude, office.Latitude, office.Longitude);
    if (sysSettings.StrictGeofence && distance > office.RadiusMeters) 
        throw new RuleException($"You are {Math.Round(distance)}m away from {office.Name}. You must be inside the {office.RadiusMeters}m workplace boundary to mark attendance.");
    if (input.CheckType is not ("CHECK_IN" or "CHECK_OUT")) throw new RuleException("Invalid attendance action.");
    var photo = Guard.Photo(input.PhotoBase64);

    // Bind verification to the authenticated employee; arbitrary selection is demo-only.
    var employees = await s.Employees();
    var emp = AttendanceIdentity.Resolve(employees,
        (string)c.Items["user"]!, (string)c.Items["email"]!, input.UserId, demo);
    if (emp == null || !emp.IsActive)
        throw new RuleException("Employee account not found or inactive.", 404);

    if (string.IsNullOrWhiteSpace(emp.PhotoBase64))
        return FaceEnrollment.Failure(new("reference_missing",
            "Ask an administrator to register your reference face photo before marking attendance.",
            null, "reference_missing", FaceVerificationService.ModelId));

    byte[] reference;
    try { reference = Guard.Photo(emp.PhotoBase64); }
    catch (RuleException) {
        return FaceEnrollment.Failure(new("reference_invalid",
            "Your registered photo needs to be replaced. Ask an administrator to register a clear face photo.",
            null, "reference_encoding", FaceVerificationService.ModelId));
    }

    // Both check-in and check-out must match the registered employee reference.
    var verification = faces.Verify(photo, reference);
    if (verification.Decision != "match") return FaceEnrollment.Failure(verification);

    var effectiveUser = emp.UserId ?? emp.Id.ToString();
    var entry = await s.Mark(effectiveUser, input, photo, distance, office.Name, emp);
    return Results.Ok(entry with { FaceVerification = verification });
}).RequireRateLimiting("writes");

// --- ATTENDANCE CORRECTIONS (SRS Section 7 & 10) ---
app.MapPost("/api/attendance/correct", async (AttendanceCorrectionInput input, Store s, HttpContext c) => {
    var isAdmin = (bool)(c.Items["admin"] ?? false);
    if (!isAdmin) return Results.StatusCode(403);
    if (string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Trim().Length < 3)
        throw new RuleException("A valid reason for attendance correction is required (minimum 3 characters).");
    
    var actorEmail = (string)c.Items["email"]!;
    var actorId = (string)c.Items["user"]!;
    var corrected = await s.CorrectAttendance(input.EntryId, input.NewTimestamp, input.Reason.Trim(), actorId, actorEmail);
    return corrected != null ? Results.Ok(corrected) : Results.NotFound();
}).RequireRateLimiting("writes");

// --- AUDIT LOGS (SRS Section 2, 12, 14) ---
app.MapGet("/api/audit", async (Store s, HttpContext c) => {
    var isAdmin = (bool)(c.Items["admin"] ?? false);
    if (!isAdmin) return Results.StatusCode(403);
    return Results.Ok(await s.GetAuditLogs());
});

// --- SYSTEM SETTINGS (SRS Section 4, 8, 10, 14) ---
app.MapGet("/api/settings", async (Store s) => {
    return Results.Ok(await s.GetSettings());
});

app.MapPut("/api/settings", async (SystemSettings input, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    if (!isSuper) return Results.StatusCode(403);
    var actorEmail = (string)(c.Items["email"] ?? "superadmin@present.local");
    var actorId = (string)(c.Items["user"] ?? "system");
    var updated = await s.UpdateSettings(input, actorId, actorEmail);
    return Results.Ok(updated);
}).RequireRateLimiting("writes");

app.MapPost("/api/admin/change-password", async (ChangePasswordInput input, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    if (!isSuper) return Results.StatusCode(403);
    if (string.IsNullOrWhiteSpace(input.NewPassword) || input.NewPassword.Trim().Length < 6)
        throw new RuleException("New password must be at least 6 characters.");
    var currentUserId = (string)(c.Items["user"] ?? "");
    var currentEmail = (string)(c.Items["email"] ?? "superadmin@present.local");
    await s.UpdateUserPassword(currentUserId, input.NewPassword.Trim());
    await s.AddAuditLog(currentUserId, currentEmail, "PASSWORD_CHANGE", "Super Administrator Account", "Super Admin updated master portal password.", null, null);
    return Results.Ok(new { success = true, message = "Super Admin password updated successfully." });
}).RequireRateLimiting("writes");

// --- PAYROLL & SALARY SLIPS (SRS Section 8, 9, 13) ---
app.MapGet("/api/payroll", async (int? year, int? month, string? user_id, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    var isAdmin = (bool)(c.Items["admin"] ?? false);
    var currentUser = (string)c.Items["user"]!;
    
    var targetUser = (!isSuper && !isAdmin) ? currentUser : user_id;
    var y = year ?? DateTime.UtcNow.Year;
    var m = month ?? DateTime.UtcNow.Month;
    var payroll = await s.CalculatePayroll(y, m, targetUser);
    return Results.Ok(payroll);
});

app.MapPost("/api/payroll/approve", async (PayrollApproveInput input, Store s, HttpContext c) => {
    var isSuper = (bool)(c.Items["super_admin"] ?? false);
    if (!isSuper) return Results.StatusCode(403);
    var actorEmail = (string)c.Items["email"]!;
    var actorId = (string)c.Items["user"]!;
    var run = await s.ApprovePayroll(input.Year, input.Month, actorId, actorEmail, input.Notes);
    return Results.Ok(run);
}).RequireRateLimiting("writes");

app.MapGet("/api/me/payslip", async (int? year, int? month, Store s, HttpContext c) => {
    var currentUser = (string)c.Items["user"]!;
    var y = year ?? DateTime.UtcNow.Year;
    var m = month ?? DateTime.UtcNow.Month;
    var payslip = await s.GetEmployeePayslip(currentUser, y, m);
    return payslip != null ? Results.Ok(payslip) : Results.NotFound();
});
app.Run();

public record Office(Guid Id, string Name, string Address, double Latitude, double Longitude, double RadiusMeters);
public record Submission(Guid OfficeId, string CheckType, double Latitude, double Longitude, double AccuracyMeters, DateTimeOffset CapturedAt, string PhotoBase64, string? UserId = null);
public record Entry(
    Guid Id,
    string UserId,
    Guid OfficeId,
    string OfficeName,
    string CheckType,
    DateTimeOffset Timestamp,
    double Latitude,
    double Longitude,
    double AccuracyMeters,
    double DistanceMeters,
    string PhotoPath,
    string? ArrivalStatus = null,
    string? EmployeeName = null,
    string? EmployeeId = null,
    double? WorkedMinutes = null,
    double? ShortfallMinutes = null,
    string? CorrectionReason = null,
    DateTimeOffset? OriginalTimestamp = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    FaceVerificationResult? FaceVerification = null
);
public record Employee(
    Guid Id,
    string? UserId,
    string Name,
    string Email,
    string Designation,
    decimal MonthlySalary,
    string Currency,
    DateTimeOffset CreatedAt,
    string? PhotoBase64 = null,
    string? PortalPassword = null,
    bool MustChangePassword = false,
    string? EmployeeId = null,
    string? Department = null,
    string? Shift = null,
    DateTimeOffset? JoiningDate = null,
    bool IsActive = true
);
public record EmployeeInput(
    string Name,
    string Email,
    string? Designation,
    decimal MonthlySalary,
    string? Currency,
    string? UserId = null,
    string? PhotoBase64 = null,
    string? PortalPassword = null,
    bool? MustChangePassword = null,
    string? EmployeeId = null,
    string? Department = null,
    string? Shift = null,
    DateTimeOffset? JoiningDate = null,
    bool? IsActive = null
);
public record ChangePasswordInput(string? CurrentPassword, string NewPassword, string? UserId = null);
public record ForgotPasswordInput(string Email, string NewPassword, string? EmployeeId = null);
public record ProfileInput(string Name, string Email);
public record CalibrateInput(Guid? OfficeId, double Latitude, double Longitude, double? RadiusMeters = null, double? AccuracyMeters = null);
public record RegisterInput(
    string Name,
    string? Email = null,
    string? Password = null,
    string? Designation = null,
    decimal? MonthlySalary = 0,
    string? Currency = "INR",
    string? PhotoBase64 = null,
    string? EmployeeId = null,
    string? Department = null,
    string? Shift = null,
    DateTimeOffset? JoiningDate = null,
    bool? IsActive = true
);
public record AttendanceCorrectionInput(Guid EntryId, DateTimeOffset NewTimestamp, string Reason);
public record PayrollApproveInput(int Year, int Month, string? Notes = null);
public record AuditLog(
    Guid Id,
    string ActorId,
    string ActorEmail,
    string Action,
    string Target,
    string? Reason,
    string? BeforeValue,
    string? AfterValue,
    DateTimeOffset Timestamp
);
public record SystemSettings(
    string CompanyName = "Present Technologies Pvt Ltd",
    string WorkplaceCode = "WRK-HQ",
    string SupportEmail = "superadmin@gmail.com",
    string DefaultCurrency = "INR",
    string Timezone = "Asia/Kolkata",
    string DateFormat = "DD/MM/YYYY",
    string ShiftStart = "09:00",
    string ShiftEnd = "18:00",
    int GracePeriodMins = 15,
    double MinWorkHours = 8.0,
    double HalfDayHours = 4.0,
    int DaysInSalaryMonth = 26,
    string SalaryModel = "fixed_26",
    double OvertimeMultiplier = 1.5,
    int DefaultGeofenceRadius = 50,
    int MaxGpsAccuracy = 250,
    bool StrictGeofence = true,
    double FaceMatchThreshold = 0.45,
    string FaceCheckMode = "both",
    bool RequireFirstLoginPassChange = true,
    bool AutoCheckoutEnabled = true,
    DateTimeOffset? UpdatedAt = null,
    string? UpdatedBy = null
);
public record PayrollItem(
    string EmployeeId,
    string EmployeeName,
    string Email,
    string Designation,
    decimal MonthlySalary,
    decimal DailyRate,
    string Currency,
    int DaysPresent,
    double ScheduledHours,
    double ActualWorkedHours,
    double ShortfallHours,
    double AttendanceFraction,
    decimal GrossPay,
    decimal ShortfallDeductions,
    decimal NetPay,
    string Status
);
public record PayrollSummary(
    int Year,
    int Month,
    string PeriodName,
    int TotalEmployees,
    decimal TotalPayroll,
    string Status,
    DateTimeOffset GeneratedAt,
    List<PayrollItem> Items
);
public class RuleException(string message, int status = 400) : Exception(message) { public int Status => status; }
public static class Guard {
    public static double Distance(double lat, double lon, double lat2, double lon2) {
        double R(double x) => x * Math.PI / 180;
        var a = Math.Pow(Math.Sin(R(lat2-lat)/2),2) + Math.Cos(R(lat))*Math.Cos(R(lat2))*Math.Pow(Math.Sin(R(lon2-lon)/2),2);
        return 6371000 * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0, 1-a)));
    }
    public static void Office(Office o) {
        if (string.IsNullOrWhiteSpace(o.Name) || o.Name.Length > 100 || string.IsNullOrWhiteSpace(o.Address) || o.Address.Length > 250 || !double.IsFinite(o.Latitude) || Math.Abs(o.Latitude)>90 || !double.IsFinite(o.Longitude) || Math.Abs(o.Longitude)>180 || !double.IsFinite(o.RadiusMeters) || o.RadiusMeters < 20 || o.RadiusMeters > 1000) throw new RuleException("Enter a name, address, valid coordinates, and a radius between 20 and 1,000 metres.");
    }
    public static void Employee(EmployeeInput e) {
        if (string.IsNullOrWhiteSpace(e.Name) || e.Name.Trim().Length > 100) throw new RuleException("Enter a valid employee name up to 100 characters.");
        if (string.IsNullOrWhiteSpace(e.Email) || e.Email.Trim().Length > 150 || !e.Email.Contains('@')) throw new RuleException("Enter a valid email address.");
        if (e.MonthlySalary < 0 || e.MonthlySalary > 1_000_000_000) throw new RuleException("Enter a valid monthly salary (zero or greater).");
    }
    public static void Position(Submission s, double maxAccuracy = 250) {
        if (!double.IsFinite(s.Latitude) || Math.Abs(s.Latitude)>90 || !double.IsFinite(s.Longitude) || Math.Abs(s.Longitude)>180 || !double.IsFinite(s.AccuracyMeters) || s.AccuracyMeters <= 0 || s.AccuracyMeters > maxAccuracy) throw new RuleException($"A valid GPS reading with accuracy of {maxAccuracy} metres or better is required.");
        var age = DateTimeOffset.UtcNow - s.CapturedAt;
        if (age.TotalSeconds > 120 || age.TotalSeconds < -30) throw new RuleException("Your location expired. Verify your location again.");
    }
    public static byte[] Photo(string value) {
        if (string.IsNullOrEmpty(value) || !value.StartsWith("data:image/jpeg;base64,") || value.Length > 4_000_000) throw new RuleException("A JPEG camera photo under 3 MB is required.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(value[23..]); } catch { throw new RuleException("Invalid photo encoding."); }
        if (bytes.Length < 50 || bytes.Length > 3_000_000 || bytes[0] != 255 || bytes[1] != 216) throw new RuleException("Invalid JPEG photo.");
        return bytes;
    }
}
public class Store {
    private readonly bool demo;
    private readonly HttpClient http;
    private readonly string root;
    private readonly SemaphoreSlim gate = new(1);
    private readonly JsonSerializerOptions json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly string folder;
    public string DataFolder => folder;
    public Store(IConfiguration config, IHttpClientFactory factory, IWebHostEnvironment env) {
        demo = config.GetValue<bool>("DemoMode"); root = (config["Supabase:Url"] ?? "").TrimEnd('/');
        http = factory.CreateClient();
        if (!demo) { http.DefaultRequestHeaders.Add("apikey", config["Supabase:ServiceRoleKey"]); http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", config["Supabase:ServiceRoleKey"]); }
        folder = Path.Combine(env.ContentRootPath, "data");
        if (demo) { Directory.CreateDirectory(folder); Directory.CreateDirectory(Path.Combine(folder,"photos")); }
    }
    async Task<T> Remote<T>(HttpMethod method, string path, object? body = null) {
        using var req = new HttpRequestMessage(method, root + path);
        req.Headers.Add("Prefer", "return=representation");
        if (body != null) req.Content = new StringContent(JsonSerializer.Serialize(body,json), System.Text.Encoding.UTF8, "application/json");
        using var res = await http.SendAsync(req);
        if (!res.IsSuccessStatusCode) {
            var errorBody = await res.Content.ReadAsStringAsync();
            if (errorBody.Contains("Invalid attendance sequence")) throw new RuleException("Attendance already changed. Refresh and try again.", 409);
            if (res.StatusCode == System.Net.HttpStatusCode.Conflict || errorBody.Contains("23505")) throw new RuleException("An employee with this email already exists.", 409);
            if (errorBody.Contains("23503")) throw new RuleException("Foreign key error: user account not found.", 400);
            throw new HttpRequestException($"Supabase request failed: {(int)res.StatusCode} - {errorBody}");
        }
        return JsonSerializer.Deserialize<T>(await res.Content.ReadAsStringAsync(),json)!;
    }
    List<T> Read<T>(string file) => File.Exists(Path.Combine(folder,file)) ? JsonSerializer.Deserialize<List<T>>(File.ReadAllText(Path.Combine(folder,file)),json)! : [];
    void Save<T>(string file, List<T> values) { var path=Path.Combine(folder,file); File.WriteAllText(path+".tmp",JsonSerializer.Serialize(values,json)); File.Move(path+".tmp",path,true); }
    public async Task<List<Office>> Offices() {
        if (!demo) return await Remote<List<Office>>(HttpMethod.Get,"/rest/v1/offices?select=*&order=name");
        await gate.WaitAsync(); try { return Read<Office>("offices.json"); } finally { gate.Release(); }
    }
    public async Task<Office> AddOffice(Office o) {
        if (!demo) return (await Remote<List<Office>>(HttpMethod.Post,"/rest/v1/offices",o))[0];
        await gate.WaitAsync(); try { var all=Read<Office>("offices.json"); all.Add(o); Save("offices.json",all); return o; } finally { gate.Release(); }
    }
    public async Task<Office?> UpdateOffice(Guid id, Office updated) {
        if (!demo) {
            var res = await Remote<List<Office>>(HttpMethod.Patch, $"/rest/v1/offices?id=eq.{id}", updated);
            return res.FirstOrDefault();
        }
        await gate.WaitAsync(); try {
            var list = Read<Office>("offices.json");
            var idx = list.FindIndex(o => o.Id == id);
            if (idx == -1) {
                if (list.Count > 0) idx = 0;
                else return null;
            }
            list[idx] = updated with { Id = list[idx].Id };
            Save("offices.json", list);
            return list[idx];
        } finally { gate.Release(); }
    }
    public async Task<bool> DeleteOffice(Guid id) {
        if (!demo) {
            try {
                await Remote<object>(HttpMethod.Delete, $"/rest/v1/offices?id=eq.{id}");
                return true;
            } catch { return false; }
        }
        await gate.WaitAsync(); try {
            var list = Read<Office>("offices.json");
            var count = list.RemoveAll(o => o.Id == id);
            if (count > 0) Save("offices.json", list);
            return count > 0;
        } finally { gate.Release(); }
    }
    public static string GenerateEmail(string name) {
        var parts = (name ?? "").Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var slug = parts.Length switch {
            0 => "employee",
            1 => parts[0],
            _ => $"{parts[0]}.{parts[^1]}"
        };
        var cleanSlug = new string(slug.Where(c => char.IsLetterOrDigit(c) || c == '.').ToArray());
        if (string.IsNullOrWhiteSpace(cleanSlug)) cleanSlug = "employee";
        return $"{cleanSlug}@present.local";
    }

    public static string GeneratePassword(string name) {
        var parts = (name ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var firstName = parts.Length > 0 ? parts[0] : "Present";
        var cleanWord = new string(firstName.Where(char.IsLetter).ToArray());
        if (cleanWord.Length > 0) cleanWord = char.ToUpper(cleanWord[0]) + cleanWord[1..].ToLowerInvariant();
        else cleanWord = "Present";
        var num = Random.Shared.Next(1000, 9999);
        return $"{cleanWord}@{num}";
    }

    public async Task<List<Employee>> Employees() {
        if (!demo) return await Remote<List<Employee>>(HttpMethod.Get, "/rest/v1/employees?select=*&order=name");
        await gate.WaitAsync(); try {
            return Read<Employee>("employees.json");
        } finally { gate.Release(); }
    }
    public async Task<Employee> AddEmployee(EmployeeInput input) {
        var id = Guid.NewGuid();
        string? resolvedUserId = null;
        if (demo) {
            resolvedUserId = string.IsNullOrWhiteSpace(input.UserId) ? id.ToString() : input.UserId.Trim();
        } else if (!string.IsNullOrWhiteSpace(input.UserId)) {
            resolvedUserId = input.UserId.Trim();
        }

        if (string.IsNullOrWhiteSpace(input.Email))
            throw new RuleException("Please enter a valid Google email address (e.g. employee@gmail.com).");
        var email = input.Email.Trim().ToLowerInvariant();
        var password = !string.IsNullOrWhiteSpace(input.PortalPassword) ? input.PortalPassword.Trim() : GeneratePassword(input.Name);

        var mustChange = input.MustChangePassword ?? true;
        var emp = new Employee(
            id,
            resolvedUserId,
            input.Name.Trim(),
            email,
            string.IsNullOrWhiteSpace(input.Designation) ? "Team Member" : input.Designation.Trim(),
            input.MonthlySalary,
            string.IsNullOrWhiteSpace(input.Currency) ? "INR" : input.Currency.Trim().ToUpperInvariant(),
            DateTimeOffset.UtcNow,
            input.PhotoBase64,
            password,
            mustChange,
            string.IsNullOrWhiteSpace(input.EmployeeId) ? $"EMP-{Random.Shared.Next(1000, 9999)}" : input.EmployeeId.Trim(),
            string.IsNullOrWhiteSpace(input.Department) ? "Operations" : input.Department.Trim(),
            string.IsNullOrWhiteSpace(input.Shift) ? "General Morning (09:00 - 18:00)" : input.Shift.Trim(),
            input.JoiningDate ?? DateTimeOffset.UtcNow,
            input.IsActive ?? true
        );
        if (!demo) {
            if (string.IsNullOrWhiteSpace(resolvedUserId) && !string.IsNullOrWhiteSpace(emp.Email)) {
                try {
                    var authAdminPayload = new {
                        email = emp.Email,
                        password = password,
                        email_confirm = true,
                        user_metadata = new { name = emp.Name, role = "user" },
                        app_metadata = new { role = "user" }
                    };
                    using var authReq = new HttpRequestMessage(HttpMethod.Post, root + "/auth/v1/admin/users");
                    authReq.Content = new StringContent(JsonSerializer.Serialize(authAdminPayload, json), System.Text.Encoding.UTF8, "application/json");
                    using var authRes = await http.SendAsync(authReq);
                    if (authRes.IsSuccessStatusCode) {
                        var authUser = JsonNode.Parse(await authRes.Content.ReadAsStringAsync());
                        resolvedUserId = authUser?["id"]?.GetValue<string>();
                    } else {
                        // User might already exist in Supabase Auth (e.g. from prior retry): lookup by email
                        using var listReq = new HttpRequestMessage(HttpMethod.Get, root + "/auth/v1/admin/users");
                        using var listRes = await http.SendAsync(listReq);
                        if (listRes.IsSuccessStatusCode) {
                            var listNode = JsonNode.Parse(await listRes.Content.ReadAsStringAsync());
                            var existingAuth = listNode?["users"]?.AsArray()
                                .FirstOrDefault(u => string.Equals(u?["email"]?.GetValue<string>(), emp.Email, StringComparison.OrdinalIgnoreCase));
                            if (existingAuth != null) {
                                resolvedUserId = existingAuth["id"]?.GetValue<string>();
                                if (!string.IsNullOrWhiteSpace(password) && !string.IsNullOrWhiteSpace(resolvedUserId)) {
                                    using var pwReq = new HttpRequestMessage(HttpMethod.Put, root + $"/auth/v1/admin/users/{resolvedUserId}");
                                    pwReq.Content = new StringContent(JsonSerializer.Serialize(new { password = password.Trim() }), System.Text.Encoding.UTF8, "application/json");
                                    await http.SendAsync(pwReq);
                                }
                            }
                        }
                    }
                    if (!string.IsNullOrWhiteSpace(resolvedUserId)) {
                        emp = emp with { UserId = resolvedUserId };
                    }
                } catch { }
            }

            // Map ONLY valid public.employees table columns (do not include non-existent portal_password or must_change_password)
            var existingRows = await Remote<List<Employee>>(HttpMethod.Get, $"/rest/v1/employees?email=eq.{Uri.EscapeDataString(emp.Email)}");
            var dbPayload = new Dictionary<string, object?> {
                ["name"] = emp.Name,
                ["email"] = emp.Email,
                ["designation"] = emp.Designation,
                ["monthly_salary"] = emp.MonthlySalary,
                ["currency"] = emp.Currency,
                ["photo_base64"] = emp.PhotoBase64
            };
            if (!string.IsNullOrWhiteSpace(emp.UserId)) {
                dbPayload["user_id"] = emp.UserId;
            }

            if (existingRows != null && existingRows.Count > 0) {
                var updated = await Remote<List<Employee>>(HttpMethod.Patch, $"/rest/v1/employees?id=eq.{existingRows[0].Id}", dbPayload);
                var row = updated.Count > 0 ? updated[0] : existingRows[0];
                return row with {
                    PortalPassword = password,
                    MustChangePassword = mustChange,
                    EmployeeId = string.IsNullOrWhiteSpace(row.EmployeeId) ? emp.EmployeeId : row.EmployeeId,
                    Department = string.IsNullOrWhiteSpace(row.Department) ? emp.Department : row.Department,
                    Shift = string.IsNullOrWhiteSpace(row.Shift) ? emp.Shift : row.Shift,
                    JoiningDate = row.JoiningDate ?? emp.JoiningDate,
                    IsActive = row.IsActive
                };
            } else {
                dbPayload["id"] = emp.Id;
                dbPayload["created_at"] = emp.CreatedAt;
                var created = await Remote<List<Employee>>(HttpMethod.Post, "/rest/v1/employees", dbPayload);
                var row = created.Count > 0 ? created[0] : emp;
                return row with {
                    PortalPassword = password,
                    MustChangePassword = mustChange,
                    EmployeeId = string.IsNullOrWhiteSpace(row.EmployeeId) ? emp.EmployeeId : row.EmployeeId,
                    Department = string.IsNullOrWhiteSpace(row.Department) ? emp.Department : row.Department,
                    Shift = string.IsNullOrWhiteSpace(row.Shift) ? emp.Shift : row.Shift,
                    JoiningDate = row.JoiningDate ?? emp.JoiningDate,
                    IsActive = row.IsActive
                };
            }
        }
        await gate.WaitAsync(); try {
            var list = Read<Employee>("employees.json");
            var finalEmail = emp.Email;
            int counter = 2;
            while (list.Any(e => e.Email.Equals(finalEmail, StringComparison.OrdinalIgnoreCase))) {
                var atIdx = emp.Email.IndexOf('@');
                var prefix = atIdx > 0 ? emp.Email[..atIdx] : emp.Email;
                var domain = atIdx > 0 ? emp.Email[atIdx..] : "@present.local";
                finalEmail = $"{prefix}{counter}{domain}";
                counter++;
            }
            emp = emp with { Email = finalEmail, PortalPassword = password };
            list.Add(emp);
            Save("employees.json", list);
            return emp;
        } finally { gate.Release(); }
    }
    public async Task<Employee?> UpdateEmployee(Guid id, EmployeeInput input) {
        var cleanPhoto = string.IsNullOrWhiteSpace(input.PhotoBase64) ? null : input.PhotoBase64;
        if (!demo) {
            var existingList = await Employees();
            var existingEmp = existingList.FirstOrDefault(e => e.Id == id);
            var patch = new Dictionary<string, object?> {
                ["name"] = input.Name.Trim(),
                ["email"] = input.Email.Trim().ToLowerInvariant(),
                ["designation"] = string.IsNullOrWhiteSpace(input.Designation) ? "Team Member" : input.Designation.Trim(),
                ["monthly_salary"] = input.MonthlySalary,
                ["currency"] = string.IsNullOrWhiteSpace(input.Currency) ? "INR" : input.Currency.Trim().ToUpperInvariant(),
                ["photo_base64"] = cleanPhoto
            };
            if (!string.IsNullOrWhiteSpace(input.UserId)) {
                patch["user_id"] = input.UserId.Trim();
            }
            if (!string.IsNullOrWhiteSpace(input.PortalPassword) && !string.IsNullOrWhiteSpace(existingEmp?.UserId)) {
                try {
                    using var pwReq = new HttpRequestMessage(HttpMethod.Put, root + $"/auth/v1/admin/users/{existingEmp.UserId}");
                    pwReq.Content = new StringContent(JsonSerializer.Serialize(new { password = input.PortalPassword.Trim() }), System.Text.Encoding.UTF8, "application/json");
                    await http.SendAsync(pwReq);
                } catch { }
            }
            var updated = await Remote<List<Employee>>(HttpMethod.Patch, $"/rest/v1/employees?id=eq.{id}", patch);
            var res = updated.FirstOrDefault() ?? existingEmp;
            return res != null ? res with {
                PortalPassword = input.PortalPassword ?? existingEmp?.PortalPassword,
                EmployeeId = input.EmployeeId ?? existingEmp?.EmployeeId,
                Department = input.Department ?? existingEmp?.Department,
                Shift = input.Shift ?? existingEmp?.Shift,
                JoiningDate = input.JoiningDate ?? existingEmp?.JoiningDate,
                IsActive = input.IsActive ?? existingEmp?.IsActive ?? true
            } : null;
        }
        await gate.WaitAsync(); try {
            var list = Read<Employee>("employees.json");
            var idx = list.FindIndex(e => e.Id == id);
            if (idx < 0) return null;
            var existing = list[idx];
            var updated = existing with {
                Name = input.Name.Trim(),
                Email = input.Email.Trim().ToLowerInvariant(),
                Designation = string.IsNullOrWhiteSpace(input.Designation) ? "Team Member" : input.Designation.Trim(),
                MonthlySalary = input.MonthlySalary,
                Currency = string.IsNullOrWhiteSpace(input.Currency) ? "INR" : input.Currency.Trim().ToUpperInvariant(),
                UserId = input.UserId ?? existing.UserId,
                PhotoBase64 = cleanPhoto,
                PortalPassword = input.PortalPassword ?? existing.PortalPassword,
                MustChangePassword = input.MustChangePassword ?? existing.MustChangePassword,
                EmployeeId = input.EmployeeId ?? existing.EmployeeId,
                Department = input.Department ?? existing.Department,
                Shift = input.Shift ?? existing.Shift,
                JoiningDate = input.JoiningDate ?? existing.JoiningDate,
                IsActive = input.IsActive ?? existing.IsActive
            };
            list[idx] = updated;
            Save("employees.json", list);
            return updated;
        } finally { gate.Release(); }
    }
    public async Task<bool> DeleteEmployee(Guid id) {
        var employees = await Employees();
        var emp = employees.FirstOrDefault(e => e.Id == id);
        if (emp == null) return false;

        var targetUserId = emp.UserId ?? emp.Id.ToString();

        if (!demo) {
            // 1. Delete all attendance photos from Supabase Storage
            try {
                var attPhotos = await Remote<List<Entry>>(HttpMethod.Get, $"/rest/v1/attendance?user_id=eq.{Uri.EscapeDataString(targetUserId)}&select=id,photo_path");
                foreach (var att in attPhotos) {
                    if (!string.IsNullOrWhiteSpace(att.PhotoPath)) {
                        try {
                            using var delPhotoReq = new HttpRequestMessage(HttpMethod.Delete, root + "/storage/v1/object/attendance-photos/" + att.PhotoPath);
                            await http.SendAsync(delPhotoReq);
                        } catch { }
                    }
                }
            } catch { }

            // 2. Delete all attendance records for this employee
            try {
                using var delAttReq = new HttpRequestMessage(HttpMethod.Delete, root + $"/rest/v1/attendance?user_id=eq.{Uri.EscapeDataString(targetUserId)}");
                await http.SendAsync(delAttReq);
            } catch { }

            // 3. Delete employee row from public.employees
            using var delEmpReq = new HttpRequestMessage(HttpMethod.Delete, root + $"/rest/v1/employees?id=eq.{id}");
            var delEmpRes = await http.SendAsync(delEmpReq);

            // 4. Delete Supabase Auth account completely from auth.users
            if (!string.IsNullOrWhiteSpace(emp.UserId)) {
                try {
                    using var delAuthReq = new HttpRequestMessage(HttpMethod.Delete, root + $"/auth/v1/admin/users/{emp.UserId}");
                    await http.SendAsync(delAuthReq);
                } catch { }
            }
            if (!string.IsNullOrWhiteSpace(emp.Email)) {
                try {
                    using var listReq = new HttpRequestMessage(HttpMethod.Get, root + "/auth/v1/admin/users");
                    using var listRes = await http.SendAsync(listReq);
                    if (listRes.IsSuccessStatusCode) {
                        var listNode = JsonNode.Parse(await listRes.Content.ReadAsStringAsync());
                        var existingAuth = listNode?["users"]?.AsArray()
                            .FirstOrDefault(u => string.Equals(u?["email"]?.GetValue<string>(), emp.Email, StringComparison.OrdinalIgnoreCase));
                        var authId = existingAuth?["id"]?.GetValue<string>();
                        if (!string.IsNullOrWhiteSpace(authId) && authId != emp.UserId) {
                            using var delAuthReq2 = new HttpRequestMessage(HttpMethod.Delete, root + $"/auth/v1/admin/users/{authId}");
                            await http.SendAsync(delAuthReq2);
                        }
                    }
                } catch { }
            }

            return delEmpRes.IsSuccessStatusCode;
        }

        await gate.WaitAsync(); try {
            var list = Read<Employee>("employees.json");
            var count = list.RemoveAll(e => e.Id == id);
            if (count > 0) Save("employees.json", list);

            var attAll = Read<Entry>("attendance.json");
            var removedAtt = attAll.Where(a => string.Equals(a.UserId, targetUserId, StringComparison.OrdinalIgnoreCase)
                                            || string.Equals(a.UserId, id.ToString(), StringComparison.OrdinalIgnoreCase)).ToList();
            attAll.RemoveAll(a => string.Equals(a.UserId, targetUserId, StringComparison.OrdinalIgnoreCase)
                               || string.Equals(a.UserId, id.ToString(), StringComparison.OrdinalIgnoreCase));
            Save("attendance.json", attAll);

            foreach (var att in removedAtt) {
                var photoFile = Path.Combine(folder, "photos", att.Id + ".jpg");
                if (File.Exists(photoFile)) {
                    try { File.Delete(photoFile); } catch { }
                }
            }
            return count > 0;
        } finally { gate.Release(); }
    }
    public async Task<List<Entry>> History(string? user) {
        List<Entry> rawList;
        if (!demo) {
            var url = string.IsNullOrWhiteSpace(user) 
                ? "/rest/v1/attendance?select=*&order=timestamp.desc&limit=1000"
                : $"/rest/v1/attendance?user_id=eq.{Uri.EscapeDataString(user)}&select=*&order=timestamp.desc&limit=1000";
            rawList = await Remote<List<Entry>>(HttpMethod.Get, url);
        } else {
            await gate.WaitAsync(); try {
                var all = Read<Entry>("attendance.json");
                rawList = (string.IsNullOrWhiteSpace(user) ? all : all.Where(e=>string.Equals(e.UserId, user, StringComparison.OrdinalIgnoreCase)))
                    .OrderByDescending(e=>e.Timestamp).ToList();
            } finally { gate.Release(); }
        }

        var emps = await Employees();
        var empMap = emps.ToDictionary(e => e.UserId ?? e.Id.ToString(), StringComparer.OrdinalIgnoreCase);

        var enriched = new List<Entry>();
        var userGroups = rawList.GroupBy(e => e.UserId);

        foreach (var ug in userGroups) {
            empMap.TryGetValue(ug.Key, out var emp);
            var empName = emp?.Name ?? "Employee";
            var empId = emp?.EmployeeId ?? (emp != null ? $"EMP-{emp.Id.ToString()[..8].ToUpper()}" : "EMP-001");

            var dayGroups = ug.GroupBy(e => e.Timestamp.Date);
            foreach (var dg in dayGroups) {
                var dayEntries = dg.OrderBy(e => e.Timestamp).ToList();
                var checkIn = dayEntries.FirstOrDefault(e => e.CheckType == "CHECK_IN");
                var checkOut = dayEntries.LastOrDefault(e => e.CheckType == "CHECK_OUT");

                double? dayWorkedMins = null;
                double? dayShortfallMins = null;
                if (checkIn != null && checkOut != null && checkOut.Timestamp > checkIn.Timestamp) {
                    var span = (checkOut.Timestamp - checkIn.Timestamp).TotalMinutes;
                    var breakMins = span >= 360 ? 60 : 0;
                    dayWorkedMins = Math.Max(0, Math.Round(span - breakMins, 1));
                    dayShortfallMins = Math.Max(0, Math.Round(480.0 - dayWorkedMins.Value, 1));
                }

                foreach (var entry in dayEntries) {
                    string arrivalStatus = entry.ArrivalStatus ?? "On-time";
                    if (entry.CheckType == "CHECK_IN") {
                        var localTime = entry.Timestamp.ToOffset(TimeSpan.FromHours(5.5)).TimeOfDay;
                        if (localTime < new TimeSpan(8, 45, 0)) arrivalStatus = "Arrived early";
                        else if (localTime > new TimeSpan(9, 15, 0)) arrivalStatus = "Late";
                        else arrivalStatus = "On-time";
                    } else if (entry.CheckType == "CHECK_OUT") {
                        arrivalStatus = (dayShortfallMins > 0) ? "Early departure" : "Standard departure";
                    }

                    enriched.Add(entry with {
                        ArrivalStatus = arrivalStatus,
                        EmployeeName = empName,
                        EmployeeId = empId,
                        WorkedMinutes = dayWorkedMins,
                        ShortfallMinutes = dayShortfallMins
                    });
                }
            }
        }

        return enriched.OrderByDescending(e => e.Timestamp).ToList();
    }
    public async Task<Entry> Mark(string user, Submission s, byte[] photo, double distance, string officeName, Employee? emp = null) {
        var id=Guid.NewGuid(); var path=$"{user}/{id}.jpg";
        var localTime = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5.5)).TimeOfDay;
        string arrivalStatus = "On-time";
        if (s.CheckType == "CHECK_IN") {
            if (localTime < new TimeSpan(8, 45, 0)) arrivalStatus = "Arrived early";
            else if (localTime > new TimeSpan(9, 15, 0)) arrivalStatus = "Late";
            else arrivalStatus = "On-time";
        }
        var empName = emp?.Name ?? "Employee";
        var empId = emp?.EmployeeId ?? (emp != null ? $"EMP-{emp.Id.ToString()[..8].ToUpper()}" : "EMP-001");

        var entry=new Entry(
            id, user, s.OfficeId, officeName, s.CheckType, DateTimeOffset.UtcNow,
            s.Latitude, s.Longitude, s.AccuracyMeters, Math.Round(distance,1), path,
            arrivalStatus, empName, empId
        );
        if (!demo) {
            using var content=new ByteArrayContent(photo); content.Headers.ContentType=new MediaTypeHeaderValue("image/jpeg");
            using var upload=await http.PostAsync(root+"/storage/v1/object/attendance-photos/"+path,content); upload.EnsureSuccessStatusCode();
            try { 
                var saved = await Remote<Entry>(HttpMethod.Post,"/rest/v1/rpc/mark_attendance",new {record=entry});
                return saved with { ArrivalStatus = arrivalStatus, EmployeeName = empName, EmployeeId = empId };
            }
            catch { using var cleanup=await http.DeleteAsync(root+"/storage/v1/object/attendance-photos/"+path); throw; }
        }
        await gate.WaitAsync(); try {
            var all=Read<Entry>("attendance.json"); var last=all.Where(e=>string.Equals(e.UserId, user, StringComparison.OrdinalIgnoreCase)).OrderByDescending(e=>e.Timestamp).FirstOrDefault();
            if ((last?.CheckType ?? "CHECK_OUT")==s.CheckType) throw new RuleException("Invalid attendance sequence. Refresh and try again.",409);
            var photoFile=Path.Combine(folder,"photos",id+".jpg");
            await File.WriteAllBytesAsync(photoFile,photo);
            try { all.Add(entry); Save("attendance.json",all); } catch { File.Delete(photoFile); throw; }
            return entry;
        } finally { gate.Release(); }
    }

    public async Task<byte[]?> DownloadAttendancePhoto(string photoPathOrId) {
        if (string.IsNullOrWhiteSpace(photoPathOrId)) return null;
        if (demo) {
            var fileName = Path.GetFileName(photoPathOrId);
            if (!fileName.EndsWith(".jpg")) fileName += ".jpg";
            var file = Path.Combine(folder, "photos", fileName);
            return File.Exists(file) ? await File.ReadAllBytesAsync(file) : null;
        }
        var path = photoPathOrId;
        if (!path.Contains('/')) {
            try {
                var all = await Remote<List<Entry>>(HttpMethod.Get, $"/rest/v1/attendance?id=eq.{photoPathOrId}");
                if (all.Count > 0 && !string.IsNullOrWhiteSpace(all[0].PhotoPath)) path = all[0].PhotoPath;
            } catch { }
        }
        try {
            using var res = await http.GetAsync(root + "/storage/v1/object/attendance-photos/" + path);
            return res.IsSuccessStatusCode ? await res.Content.ReadAsByteArrayAsync() : null;
        } catch {
            return null;
        }
    }

    public async Task<Entry?> CorrectAttendance(Guid entryId, DateTimeOffset newTimestamp, string reason, string actorId, string actorEmail) {
        Entry? target = null;
        DateTimeOffset oldTimestamp = DateTimeOffset.MinValue;
        
        if (!demo) {
            var existingList = await Remote<List<Entry>>(HttpMethod.Get, $"/rest/v1/attendance?id=eq.{entryId}");
            if (existingList == null || existingList.Count == 0) return null;
            target = existingList[0];
            oldTimestamp = target.Timestamp;
            var patch = new Dictionary<string, object?> {
                ["timestamp"] = newTimestamp
            };
            var updated = await Remote<List<Entry>>(HttpMethod.Patch, $"/rest/v1/attendance?id=eq.{entryId}", patch);
            target = (updated.Count > 0 ? updated[0] : target) with {
                Timestamp = newTimestamp,
                OriginalTimestamp = oldTimestamp,
                CorrectionReason = reason
            };
        } else {
            await gate.WaitAsync();
            try {
                var all = Read<Entry>("attendance.json");
                var idx = all.FindIndex(e => e.Id == entryId);
                if (idx < 0) return null;
                oldTimestamp = all[idx].Timestamp;
                target = all[idx] with {
                    Timestamp = newTimestamp,
                    OriginalTimestamp = oldTimestamp,
                    CorrectionReason = reason
                };
                all[idx] = target;
                Save("attendance.json", all);
            } finally {
                gate.Release();
            }
        }

        await AddAuditLog(
            actorId,
            actorEmail,
            "ATTENDANCE_CORRECTION",
            $"Entry {entryId} (User {target?.UserId})",
            reason,
            oldTimestamp.ToString("yyyy-MM-dd HH:mm:ss"),
            newTimestamp.ToString("yyyy-MM-dd HH:mm:ss")
        );

        return target;
    }

    public async Task<SystemSettings> GetSettings() {
        if (!demo) {
            try {
                var list = await Remote<List<SystemSettings>>(HttpMethod.Get, "/rest/v1/system_settings?id=eq.default");
                if (list != null && list.Count > 0) return list[0];
            } catch { }
        }
        await gate.WaitAsync();
        try {
            var file = Path.Combine(folder, "settings.json");
            if (File.Exists(file)) {
                return JsonSerializer.Deserialize<SystemSettings>(await File.ReadAllTextAsync(file), json) ?? new SystemSettings();
            }
            return new SystemSettings();
        } finally {
            gate.Release();
        }
    }

    public async Task<SystemSettings> UpdateSettings(SystemSettings newSettings, string actorId, string actorEmail) {
        var toSave = newSettings with {
            UpdatedAt = DateTimeOffset.UtcNow,
            UpdatedBy = actorEmail
        };

        if (!demo) {
            try {
                var patch = new Dictionary<string, object?> {
                    ["company_name"] = toSave.CompanyName,
                    ["workplace_code"] = toSave.WorkplaceCode,
                    ["support_email"] = toSave.SupportEmail,
                    ["default_currency"] = toSave.DefaultCurrency,
                    ["timezone"] = toSave.Timezone,
                    ["date_format"] = toSave.DateFormat,
                    ["shift_start"] = toSave.ShiftStart,
                    ["shift_end"] = toSave.ShiftEnd,
                    ["grace_period_mins"] = toSave.GracePeriodMins,
                    ["min_work_hours"] = toSave.MinWorkHours,
                    ["half_day_hours"] = toSave.HalfDayHours,
                    ["days_in_salary_month"] = toSave.DaysInSalaryMonth,
                    ["salary_model"] = toSave.SalaryModel,
                    ["overtime_multiplier"] = toSave.OvertimeMultiplier,
                    ["default_geofence_radius"] = toSave.DefaultGeofenceRadius,
                    ["max_gps_accuracy"] = toSave.MaxGpsAccuracy,
                    ["strict_geofence"] = toSave.StrictGeofence,
                    ["face_match_threshold"] = toSave.FaceMatchThreshold,
                    ["face_check_mode"] = toSave.FaceCheckMode,
                    ["require_first_login_pass_change"] = toSave.RequireFirstLoginPassChange,
                    ["auto_checkout_enabled"] = toSave.AutoCheckoutEnabled,
                    ["updated_at"] = toSave.UpdatedAt,
                    ["updated_by"] = toSave.UpdatedBy
                };
                var res = await Remote<List<SystemSettings>>(HttpMethod.Patch, "/rest/v1/system_settings?id=eq.default", patch);
                if (res != null && res.Count > 0) toSave = res[0];
            } catch { }
        }

        await gate.WaitAsync();
        try {
            Directory.CreateDirectory(folder);
            var file = Path.Combine(folder, "settings.json");
            File.WriteAllText(file, JsonSerializer.Serialize(toSave, json));
        } finally {
            gate.Release();
        }

        await AddAuditLog(
            actorId,
            actorEmail,
            "SETTINGS_UPDATE",
            "Organization Policy & Standards",
            "Super Admin updated system parameters, shifts, and security policies.",
            null,
            JsonSerializer.Serialize(toSave, json)
        );

        return toSave;
    }

    public async Task UpdateUserPassword(string userId, string newPassword) {
        if (!demo && !string.IsNullOrWhiteSpace(userId)) {
            try {
                using var pwReq = new HttpRequestMessage(HttpMethod.Put, root + $"/auth/v1/admin/users/{userId}");
                pwReq.Content = new StringContent(JsonSerializer.Serialize(new { password = newPassword }), System.Text.Encoding.UTF8, "application/json");
                await http.SendAsync(pwReq);
            } catch { }
        }
    }

    public async Task<string?> FindAuthUserIdByEmail(string email) {
        if (!demo && !string.IsNullOrWhiteSpace(email)) {
            try {
                using var listReq = new HttpRequestMessage(HttpMethod.Get, root + "/auth/v1/admin/users");
                var listResp = await http.SendAsync(listReq);
                if (listResp.IsSuccessStatusCode) {
                    var userJson = await listResp.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(userJson);
                    if (doc.RootElement.TryGetProperty("users", out var usersArr)) {
                        foreach (var u in usersArr.EnumerateArray()) {
                            if (u.TryGetProperty("email", out var e) && string.Equals(e.GetString(), email.Trim(), StringComparison.OrdinalIgnoreCase)) {
                                if (u.TryGetProperty("id", out var idProp)) {
                                    return idProp.GetString();
                                }
                            }
                        }
                    }
                }
            } catch { }
        }
        return null;
    }

    public async Task<List<AuditLog>> GetAuditLogs() {
        if (!demo) {
            try {
                var remoteLogs = await Remote<List<AuditLog>>(HttpMethod.Get, "/rest/v1/audit_logs?select=*&order=timestamp.desc&limit=200");
                if (remoteLogs != null && remoteLogs.Count > 0) return remoteLogs;
            } catch { }
        }
        await gate.WaitAsync();
        try {
            var file = Path.Combine(folder, "audit_logs.json");
            if (File.Exists(file)) {
                return JsonSerializer.Deserialize<List<AuditLog>>(await File.ReadAllTextAsync(file), json) ?? [];
            }
            return [];
        } finally {
            gate.Release();
        }
    }

    public async Task AddAuditLog(string actorId, string actorEmail, string action, string target, string? reason, string? before, string? after) {
        var log = new AuditLog(Guid.NewGuid(), actorId, actorEmail, action, target, reason, before, after, DateTimeOffset.UtcNow);
        if (!demo) {
            try {
                await Remote<List<AuditLog>>(HttpMethod.Post, "/rest/v1/audit_logs", log);
            } catch { }
        }
        await gate.WaitAsync();
        try {
            Directory.CreateDirectory(folder);
            var file = Path.Combine(folder, "audit_logs.json");
            var list = File.Exists(file) ? JsonSerializer.Deserialize<List<AuditLog>>(File.ReadAllText(file), json) ?? [] : [];
            list.Insert(0, log);
            if (list.Count > 500) list.RemoveRange(500, list.Count - 500);
            File.WriteAllText(file, JsonSerializer.Serialize(list, json));
        } finally {
            gate.Release();
        }
    }

    public async Task<PayrollSummary> CalculatePayroll(int year, int month, string? targetUser = null) {
        var employees = await Employees();
        var allHistory = await History(targetUser);
        
        var monthStart = new DateTimeOffset(year, month, 1, 0, 0, 0, TimeSpan.Zero);
        var monthEnd = monthStart.AddMonths(1);
        var periodName = monthStart.ToString("MMMM yyyy");

        var relevantEmps = string.IsNullOrWhiteSpace(targetUser) 
            ? employees 
            : employees.Where(e => e.UserId == targetUser || e.Id.ToString() == targetUser).ToList();

        var items = new List<PayrollItem>();
        decimal totalPayroll = 0m;

        foreach (var emp in relevantEmps) {
            var empUser = emp.UserId ?? emp.Id.ToString();
            var empEntries = allHistory.Where(e => 
                (e.UserId == empUser || e.UserId == emp.Id.ToString()) &&
                e.Timestamp >= monthStart && e.Timestamp < monthEnd
            ).OrderBy(e => e.Timestamp).ToList();

            var days = empEntries.GroupBy(e => e.Timestamp.Date).ToList();
            int daysPresent = days.Count;
            double totalWorkedMins = 0;
            double scheduledPaidMins = daysPresent * 480.0;

            foreach (var day in days) {
                var checkIn = day.FirstOrDefault(e => e.CheckType == "CHECK_IN");
                var checkOut = day.LastOrDefault(e => e.CheckType == "CHECK_OUT");
                if (checkIn != null && checkOut != null && checkOut.Timestamp > checkIn.Timestamp) {
                    var spanMins = (checkOut.Timestamp - checkIn.Timestamp).TotalMinutes;
                    var breakMins = spanMins >= 360 ? 60 : 0;
                    totalWorkedMins += Math.Max(0, spanMins - breakMins);
                } else if (checkIn != null) {
                    totalWorkedMins += 240.0;
                }
            }

            var actualWorkedHours = Math.Round(totalWorkedMins / 60.0, 1);
            var scheduledHours = Math.Round(scheduledPaidMins / 60.0, 1);
            var shortfallHours = Math.Max(0, Math.Round(scheduledHours - actualWorkedHours, 1));

            var dailyRate = Math.Round(emp.MonthlySalary / 26m, 2);
            var fraction = scheduledPaidMins > 0 ? Math.Min(1.0, totalWorkedMins / scheduledPaidMins) : (daysPresent > 0 ? 1.0 : 0.0);
            var grossPay = Math.Round(dailyRate * daysPresent, 2);
            var netPay = Math.Round(grossPay * (decimal)fraction, 2);
            var shortfallDeduction = Math.Max(0, grossPay - netPay);

            if (daysPresent >= 26 && netPay > emp.MonthlySalary) netPay = emp.MonthlySalary;

            totalPayroll += netPay;
            var empIdStr = emp.EmployeeId ?? $"EMP-{emp.Id.ToString()[..8].ToUpper()}";

            items.Add(new PayrollItem(
                empIdStr,
                emp.Name,
                emp.Email,
                emp.Designation,
                emp.MonthlySalary,
                dailyRate,
                emp.Currency,
                daysPresent,
                scheduledHours,
                actualWorkedHours,
                shortfallHours,
                Math.Round(fraction, 3),
                grossPay,
                shortfallDeduction,
                netPay,
                "Published & Approved"
            ));
        }

        return new PayrollSummary(
            year,
            month,
            periodName,
            items.Count,
            totalPayroll,
            "Approved & Published",
            DateTimeOffset.UtcNow,
            items
        );
    }

    public async Task<PayrollItem?> GetEmployeePayslip(string userId, int year, int month) {
        var summary = await CalculatePayroll(year, month, userId);
        return summary.Items.FirstOrDefault();
    }

    public async Task<PayrollSummary> ApprovePayroll(int year, int month, string actorId, string actorEmail, string? notes) {
        var summary = await CalculatePayroll(year, month, null);
        await AddAuditLog(
            actorId,
            actorEmail,
            "PAYROLL_APPROVED",
            $"Period {summary.PeriodName}",
            notes ?? "Monthly payroll review approved and published.",
            "Draft",
            "Approved & Published"
        );
        return summary;
    }
}
