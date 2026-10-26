// Turns Supabase Auth error codes into messages a user can act on.
// Unknown errors get a generic message plus the error code (codes are not
// sensitive and make support/debugging possible); details go to the server log.
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email first. Check your inbox (and spam folder) for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Please log in.";
    case "weak_password":
      return "That password is too weak. Use at least 8 characters with letters and numbers.";
    case "same_password":
      return "Your new password must be different from the old one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "email_address_invalid":
      return "That email address doesn't look valid.";
    case "email_address_not_authorized":
      return "We couldn't send an email to this address. Please use a different email address.";
    case "signup_disabled":
    case "email_provider_disabled":
    case "provider_disabled":
      return "Signing up with email is currently turned off.";
    case "request_timeout":
      return "The request took too long. Please try again.";
    default:
      console.error("Unhandled auth error", error.code, error.message);
      return `Something went wrong. Please try again in a moment. (Error code: ${error.code ?? "unknown"})`;
  }
}
