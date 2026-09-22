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
            Button("Sign out") { session.signOut() }
                .font(.cardo(13))
                .foregroundStyle(Color.ink.opacity(0.45))
        }
        .padding(.top, 12)
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
