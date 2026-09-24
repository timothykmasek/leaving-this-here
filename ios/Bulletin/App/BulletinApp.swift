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
        if !session.isSignedIn {
            SignInView()
        } else if session.needsSetup {
            ClaimHandleView()
        } else {
            HomeView()
        }
    }
}

// Claim your handle — the web's /start, cut to what a page needs to exist:
// a handle and a name. A first-time Apple or Google sign-in lands here (the
// account exists, the Bulletin doesn't). Posts to /api/onboarding/setup, the
// same route the web wizard ends on, so the page is identical either way.
// Lives in this file, not its own, so the Xcode project needs no regenerating.
struct ClaimHandleView: View {
    @EnvironmentObject private var session: Session
    @State private var handle = ""
    @State private var name = ""
    @State private var status: Status = .idle
    @State private var busy = false
    @State private var error: String?
    @State private var check: Task<Void, Never>?

    enum Status: Equatable { case idle, short, checking, ok, taken, reserved, invalid }

    var body: some View {
        ZStack {
            DotGround()
            VStack(alignment: .leading, spacing: 0) {
                Wordmark(height: 32)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)

                Text("Pick your handle.")
                    .font(.mier(28))
                    .foregroundStyle(Color.ink)
                    .padding(.top, 36)
                Text("This is your home on Bulletin. Share it anywhere.")
                    .font(.cardo(15))
                    .foregroundStyle(Color.ink.opacity(0.55))
                    .padding(.top, 6)

                HStack(spacing: 0) {
                    Text("yourbulletin.com/")
                        .foregroundStyle(Color.ink.opacity(0.4))
                    TextField("yourname", text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: handle) { _, raw in onHandle(raw) }
                }
                .font(.mier(16))
                .padding(.horizontal, 16)
                .frame(height: 50)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
                .padding(.top, 24)

                Text(message)
                    .font(.mier(13))
                    .foregroundStyle(status == .ok ? Color.green : status == .idle ? .clear : Color.ink.opacity(0.5))
                    .frame(height: 18)
                    .padding(.top, 6)
                    .padding(.leading, 4)

                TextField("Display name", text: $name)
                    .font(.mier(16))
                    .padding(.horizontal, 16)
                    .frame(height: 50)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
                    .padding(.top, 10)

                Button {
                    Task { await claim() }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) }
                        Text(busy ? "Building your Bulletin…" : "Create my Bulletin")
                            .font(.mierDemi(16))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
                    .opacity(status == .ok && !busy ? 1 : 0.5)
                }
                .disabled(status != .ok || busy)
                .padding(.top, 20)

                if let error {
                    Text(error)
                        .font(.cardo(14))
                        .foregroundStyle(Color.ink.opacity(0.55))
                        .padding(.top, 14)
                }

                Spacer()

                Button("Sign out") { session.signOut() }
                    .font(.mier(14))
                    .foregroundStyle(Color.ink.opacity(0.45))
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, 28)
        }
    }

    private var message: String {
        switch status {
        case .idle: return " "
        case .short: return "A little longer…"
        case .checking: return "Checking…"
        case .ok: return "✓ yourbulletin.com/\(handle) is yours"
        case .taken: return "✕ That one's taken"
        case .reserved: return "✕ That one is reserved"
        case .invalid: return "✕ Letters, numbers and hyphens only"
        }
    }

    // Same rules as the web field: lowercase letters, digits, hyphens; 3+
    // characters; a debounced availability read.
    private func onHandle(_ raw: String) {
        let cleaned = String(raw.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }.prefix(30))
        if cleaned != raw { handle = cleaned; return }
        error = nil
        check?.cancel()
        if cleaned.isEmpty { status = .idle; return }
        if cleaned.count < 3 { status = .short; return }
        status = .checking
        check = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            let result = try? await API.checkHandle(cleaned)
            guard !Task.isCancelled, cleaned == handle else { return }
            switch (result?.available, result?.reason) {
            case (false, "reserved"): status = .reserved
            case (false, "invalid"): status = .invalid
            case (false, _): status = .taken
            default: status = .ok // unreachable check fails open; setup re-checks
            }
        }
    }

    private func claim() async {
        busy = true
        error = nil
        let display = name.trimmingCharacters(in: .whitespaces)
        do {
            // Success notes the username on the session, which clears
            // needsSetup and swaps RootView over to HomeView.
            _ = try await API.setUp(handle: handle, displayName: display)
        } catch API.APIError.http(409, _) {
            status = .taken
            error = "Someone just took that one. Try another."
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
