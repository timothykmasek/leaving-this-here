import SwiftUI

@main
struct BulletinApp: App {
    @StateObject private var session = Session.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        if session.isSignedIn {
            HomeView()
        } else {
            SignInView()
        }
    }
}
