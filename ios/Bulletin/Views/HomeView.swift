import SwiftUI

// Home — recent saves in the web's masonry, list chips into list pages,
// semantic search over the pill, and the paste-to-save fab. The share
// extension stays the hero; this is the companion surface.
struct HomeView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var scenePhase

    @State private var bullets: [API.Bullet] = []
    @State private var lists: [API.List] = []
    @State private var loading = true
    @State private var error: String?

    @State private var query = ""
    @State private var results: [API.Bullet]?
    @State private var searching = false

    @State private var pasteURL: PasteTarget?
    @State private var showSettings = false

    struct PasteTarget: Identifiable {
        let url: String
        var id: String { url }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                DotGround()
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header
                        searchPill
                        if let error {
                            Text(error)
                                .font(.cardo(14))
                                .foregroundStyle(Color.ink.opacity(0.5))
                                .padding(.top, 32)
                                .frame(maxWidth: .infinity)
                        } else if loading {
                            ProgressView()
                                .padding(.top, 64)
                                .frame(maxWidth: .infinity)
                        } else if let results {
                            searchResults(results)
                        } else {
                            if !lists.isEmpty { listStrip }
                            BulletGrid(bullets: bullets)
                                .padding(.top, 16)
                                .padding(.bottom, 96)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .refreshable { await load() }

                ImportFab { url in
                    pasteURL = PasteTarget(url: url)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .navigationBarHidden(true)
            .navigationDestination(for: API.List.self) { list in
                ListDetailView(list: list)
            }
        }
        .task { await load() }
        // A save from the share sheet should be on screen when the user
        // comes back — silent refresh, no spinner over existing content.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load() } }
        }
        .sheet(item: $pasteURL, onDismiss: { Task { await load() } }) { target in
            ZStack {
                DotGround()
                VStack(spacing: 0) {
                    Wordmark(height: 30)
                        .padding(.top, 26)
                    SaveCeremonyView(url: target.url) { pasteURL = nil }
                }
            }
            .presentationDetents([.large])
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            Wordmark(height: 30)
            Spacer()
            if let username = session.current?.username,
               let url = URL(string: "\(Config.siteURL)/\(username)") {
                Link("Open on the web", destination: url)
                    .font(.cardo(13))
                    .foregroundStyle(Color.ink.opacity(0.45))
            }
            Button("Settings") { showSettings = true }
                .font(.cardo(13))
                .foregroundStyle(Color.ink.opacity(0.45))
        }
        .padding(.top, 12)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(session)
        }
    }

    // The search pill — Cardo placeholder like the web's "Search my mind"
    // moment, semantic under the hood (/api/search, bearer door).
    private var searchPill: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13))
                .foregroundStyle(Color.ink.opacity(0.35))
            TextField("Search your Bulletin…", text: $query)
                .font(.cardo(15))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .onSubmit { Task { await search() } }
            if searching {
                ProgressView().controlSize(.small)
            } else if results != nil || !query.isEmpty {
                Button {
                    query = ""
                    results = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.ink.opacity(0.25))
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.white, in: Capsule())
        .overlay(Capsule().stroke(Color.black.opacity(0.08), lineWidth: 1))
        .padding(.top, 16)
    }

    @ViewBuilder
    private func searchResults(_ results: [API.Bullet]) -> some View {
        if results.isEmpty {
            Text("Nothing in your Bulletin matches that.")
                .font(.cardo(15))
                .foregroundStyle(Color.ink.opacity(0.5))
                .padding(.top, 40)
                .frame(maxWidth: .infinity)
        } else {
            BulletGrid(bullets: results)
                .padding(.top, 20)
                .padding(.bottom, 96)
        }
    }

    private var listStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(lists) { list in
                    NavigationLink(value: list) {
                        Text(list.name)
                            .font(.mier(13))
                            .foregroundStyle(Color.ink.opacity(0.7))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Color.cardGrey, in: Capsule())
                    }
                }
            }
        }
        .padding(.top, 16)
    }

    private func load() async {
        do {
            async let findsTask = API.finds(limit: 40)
            async let listsTask = API.lists()
            let (page, listsResponse) = try await (findsTask, listsTask)
            bullets = page.finds
            lists = listsResponse.lists
            error = nil
        } catch {
            // Keep stale content on a background-refresh failure; only lead
            // with the error when there's nothing to show instead.
            if bullets.isEmpty { self.error = error.localizedDescription }
        }
        loading = false
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else {
            results = nil
            return
        }
        searching = true
        results = (try? await API.search(q)) ?? []
        searching = false
    }
}

// Settings — the web's /settings, folded into a sheet: which login you use,
// sign out, and the way out. App Store rule 5.1.1(v): an app with sign-in
// must let people delete their account from inside the app, so Delete calls
// the same /api/account/delete the web uses, with the typed-username check
// done server-side. The public face (name, bio, links) is edited on the
// web profile page, not here.
struct SettingsView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var confirm = ""
    @State private var deleting = false
    @State private var error: String?

    private var username: String { session.current?.username ?? "" }
    private var armed: Bool {
        !username.isEmpty && confirm.trimmingCharacters(in: .whitespaces).lowercased() == username.lowercased()
    }

    var body: some View {
        ZStack {
            DotGround()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    ZStack {
                        Wordmark(height: 30)
                            .frame(maxWidth: .infinity)
                        HStack {
                            Spacer()
                            Button("Done") { dismiss() }
                                .font(.cardo(15))
                                .foregroundStyle(Color.ink.opacity(0.45))
                        }
                        .padding(.trailing, 26)
                    }
                    .padding(.top, 26)

                    Text("Settings")
                        .font(.mierDemi(26))
                        .foregroundStyle(Color.ink)
                        .padding(.top, 34)

                    section("Account") {
                        Text("Signed in as ")
                            .foregroundStyle(Color.ink.opacity(0.7))
                        + Text(session.current?.email ?? username)
                            .foregroundStyle(Color.ink)
                    }

                    section("Profile") {
                        Text("Your name, bio, and links are edited on your page on the web, under the pencil.")
                            .foregroundStyle(Color.ink.opacity(0.7))
                        if let url = URL(string: "\(Config.siteURL)/\(username)"), !username.isEmpty {
                            Link("Open your page", destination: url)
                                .font(.mier(15))
                                .foregroundStyle(Color.ink)
                                .underline(true, color: Color.ink.opacity(0.3))
                                .padding(.top, 6)
                        }
                    }

                    section("Sign out") {
                        Button {
                            dismiss()
                            session.signOut()
                        } label: {
                            Text("Sign out of Bulletin")
                                .font(.mier(15))
                                .foregroundStyle(Color.ink)
                                .underline(true, color: Color.ink.opacity(0.3))
                        }
                        Text("on this phone. Your bullets and lists stay.")
                            .foregroundStyle(Color.ink.opacity(0.7))
                            .padding(.top, 2)
                    }

                    section("Delete account") {
                        Text("This removes your account, every bullet you saved, and every list you published. Your page goes away. There is no undo.")
                            .foregroundStyle(Color.ink.opacity(0.7))

                        (Text("Type ").foregroundStyle(Color.ink.opacity(0.5))
                            + Text(username).foregroundStyle(Color.ink)
                            + Text(" to confirm").foregroundStyle(Color.ink.opacity(0.5)))
                            .font(.mier(13))
                            .padding(.top, 14)

                        TextField("", text: $confirm)
                            .font(.mier(15))
                            .foregroundStyle(Color.ink)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 12)
                            .frame(height: 40)
                            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
                            .padding(.top, 6)

                        Button {
                            Task { await deleteAccount() }
                        } label: {
                            Text(deleting ? "Deleting…" : "Delete my account")
                                .font(.mierDemi(14))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 16)
                                .frame(height: 40)
                                .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                        }
                        .disabled(!armed || deleting)
                        .opacity(armed ? 1 : 0.3)
                        .padding(.top, 14)

                        if let error {
                            Text(error)
                                .font(.cardo(14))
                                .foregroundStyle(Color(red: 0.64, green: 0.12, blue: 0.2))
                                .padding(.top, 10)
                        }
                    }
                }
                .padding(.horizontal, 30)
                .padding(.bottom, 40)
            }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.mierDemi(17))
                .foregroundStyle(Color.ink)
            content()
                .font(.mier(15))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 30)
    }

    private func deleteAccount() async {
        guard armed, !deleting else { return }
        deleting = true
        error = nil
        do {
            try await API.deleteAccount(confirm: confirm.trimmingCharacters(in: .whitespaces))
            dismiss()
            session.signOut()
        } catch {
            self.error = error.localizedDescription
            deleting = false
        }
    }
}
