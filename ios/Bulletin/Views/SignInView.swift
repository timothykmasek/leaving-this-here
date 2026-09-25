import SwiftUI
import AuthenticationServices

// Sign-in — the front door, in the site's voice: dot ground, the wordmark,
// Apple above Google, dressed alike (the App Store requires Apple's
// button once Google is offered, with equal prominence), then email the way
// the web and the Chrome extension do it: an emailed one-time code. A first
// sign-in creates the account, and RootView sends it on to onboarding.
// "Use a password instead" on the email step exists for App Review's demo
// account, which can't receive a code.
struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var busy = false
    @State private var error: String?
    @State private var appleNonce: (raw: String, hashed: String)?

    enum Mode { case options, email, code, password }
    @State private var mode: Mode = .options
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            DotGround()
            VStack(spacing: 0) {
                Spacer()

                Wordmark(height: 44)

                Text("Links to keep. Lists to share.")
                    .font(.cardo(17))
                    .foregroundStyle(Color.ink.opacity(0.55))
                    .padding(.top, 14)

                Group {
                    switch mode {
                    case .options: options
                    case .email: emailStep
                    case .code: codeStep
                    case .password: passwordStep
                    }
                }
                .padding(.horizontal, 44)
                .padding(.top, 44)

                if let error {
                    Text(error)
                        .font(.cardo(14))
                        .foregroundStyle(Color.ink.opacity(0.55))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 44)
                        .padding(.top, 16)
                }

                Spacer()
                Spacer()
            }
        }
        .animation(.easeOut(duration: 0.2), value: mode)
    }

    // MARK: - The three ways in

    private var options: some View {
        VStack(spacing: 12) {
            SignInWithAppleButton(.continue) { request in
                let nonce = Session.makeNonce()
                appleNonce = nonce
                request.requestedScopes = [.email]
                request.nonce = nonce.hashed
            } onCompletion: { result in
                guard case .success(let authorization) = result,
                      let nonce = appleNonce else { return }
                Task {
                    await run { try await session.signInWithApple(authorization: authorization, rawNonce: nonce.raw) }
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Button {
                Task { await run { try await session.signInWithGoogle() } }
            } label: {
                // Dressed as Apple's button (black, same type and size)
                // so the two ways in read as equals.
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(.white) }
                    Text(busy ? "Signing in…" : "Continue with Google")
                        .font(.system(size: 19, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)
            }
            .disabled(busy)

            Button {
                error = nil
                mode = .email
                focused = true
            } label: {
                Text("Continue with email")
                    .font(.system(size: 19, weight: .medium))
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
                    .foregroundStyle(Color.ink)
            }
            .disabled(busy)
        }
    }

    // MARK: - Email → code

    private var emailStep: some View {
        VStack(spacing: 12) {
            input {
                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.send)
                    .focused($focused)
                    .onSubmit { Task { await sendCode() } }
            }
            primary(busy ? "Sending…" : "Email me a code", enabled: looksLikeEmail && !busy) {
                Task { await sendCode() }
            }
            HStack {
                quiet("Back") { mode = .options; error = nil }
                Spacer()
                quiet("Use a password instead") { mode = .password; error = nil; focused = true }
            }
            .padding(.top, 4)
        }
    }

    private var codeStep: some View {
        VStack(spacing: 12) {
            Text("We sent a code to \(email.trimmingCharacters(in: .whitespaces)).")
                .font(.cardo(15))
                .foregroundStyle(Color.ink.opacity(0.6))
                .multilineTextAlignment(.center)
            input {
                TextField("Code", text: $code)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focused)
                    .onChange(of: code) { _, v in
                        let digits = String(v.filter(\.isNumber).prefix(8))
                        if digits != v { code = digits }
                    }
            }
            primary(busy ? "Signing in…" : "Sign in", enabled: code.count >= 6 && !busy) {
                Task { await verify() }
            }
            HStack {
                quiet("Different email") { mode = .email; code = ""; error = nil }
                Spacer()
                quiet("Send a new code") { Task { await sendCode() } }
            }
            .padding(.top, 4)
        }
    }

    private var passwordStep: some View {
        VStack(spacing: 12) {
            input {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            input {
                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focused)
                    .submitLabel(.go)
                    .onSubmit { Task { await signInWithPassword() } }
            }
            primary(busy ? "Signing in…" : "Sign in", enabled: looksLikeEmail && !password.isEmpty && !busy) {
                Task { await signInWithPassword() }
            }
            HStack {
                quiet("Back") { mode = .options; error = nil }
                Spacer()
                quiet("Email me a code instead") { mode = .email; error = nil }
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Pieces

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespaces).lowercased() }
    private var looksLikeEmail: Bool {
        let e = trimmedEmail
        guard let at = e.firstIndex(of: "@") else { return false }
        return e[e.index(after: at)...].contains(".")
    }

    private func input<F: View>(@ViewBuilder _ content: () -> F) -> some View {
        content()
            .font(.mier(17))
            .padding(.horizontal, 16)
            .frame(height: 50)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
    }

    private func primary(_ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 19, weight: .medium))
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.black, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)
                .opacity(enabled ? 1 : 0.4)
        }
        .disabled(!enabled)
    }

    private func quiet(_ label: String, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .font(.mier(14))
            .foregroundStyle(Color.ink.opacity(0.5))
    }

    // MARK: - Flow

    private func sendCode() async {
        guard looksLikeEmail else { return }
        await run {
            try await session.requestEmailCode(email: trimmedEmail)
            code = ""
            mode = .code
            focused = true
        }
    }

    private func verify() async {
        await run { try await session.verifyEmailCode(email: trimmedEmail, code: code) }
    }

    private func signInWithPassword() async {
        await run { try await session.signInWithPassword(email: trimmedEmail, password: password) }
    }

    private func run(_ signIn: @escaping () async throws -> Void) async {
        busy = true
        error = nil
        do {
            try await signIn()
        } catch SessionError.cancelled {
            // No error copy for a user-dismissed sheet.
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
