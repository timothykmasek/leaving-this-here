import Foundation

// Public client constants — the Supabase URL and anon key ship in every page
// of the website's JS bundle already, so embedding them here exposes nothing
// new. RLS is the security boundary, not the key.
enum Config {
    static let siteURL = URL(string: "https://www.yourbulletin.com")!
    static let supabaseURL = URL(string: "https://xtnqvjaexkztcrriotjj.supabase.co")!
    static let supabaseAnonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0bnF2amFleGt6dGNycmlvdGpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNzI0NDQsImV4cCI6MjA5MDg0ODQ0NH0.XSHMUyZWhQ1CHJs_CNXbi4QbMruCeSLyUvyVxarWjlY"

    /// Shared container between app and share extension: the session lives
    /// here so a save from the share sheet is already signed in.
    static let appGroup = "group.com.yourbulletin.ios"

    /// ASWebAuthenticationSession callback scheme. Must be listed in the
    /// Supabase dashboard under Authentication → URL Configuration →
    /// Redirect URLs as `bulletin://auth-callback`.
    static let authCallbackScheme = "bulletin"
    static let authRedirect = "bulletin://auth-callback"
}
