import SwiftUI

// The save ceremony — the Chrome extension's card, on the phone. Shared by
// the share extension and the app's paste sheet. Callers own the paper and
// the wordmark above; this owns everything below: one headline, then the
// picker as full-bleed rows.
//
// One-frame rule (the extension's 0.4.3 contract): "Saving to your
// Bulletin…" over empty rows until the save AND the list rows are both
// ready, then one paint. No AI suggestion here (Tim, 2026-09-22) — the rows
// are the user's lists in recency order, the server's order, with the rest
// folded under "All other lists" and a "Create new list" row that becomes a
// field in place.
struct SaveCeremonyView: View {
    let url: String
    var title: String? = nil
    var clientMeta: [String: String] = [:]
    let done: () -> Void

    enum Phase {
        case saving
        case ready(Ready)
        case failed(String)
    }

    struct Ready {
        var bookmarkId: String
        var lists: [API.List]
        var memberOf: Set<String>
        var alreadySaved: Bool
    }

    /// Lists above the fold, the extension's count.
    static let topRows = 3
    static let rowHeight: CGFloat = 64
    static let hairline = Color(red: 0xec / 255, green: 0xec / 255, blue: 0xec / 255)
    static let dotWell = Color(red: 0xe4 / 255, green: 0xe4 / 255, blue: 0xe4 / 255)

    @State private var phase: Phase = .saving
    @State private var ready: Ready?
    @State private var showAll = false

    @State private var creating = false
    @State private var newName = ""
    @State private var createHint: String?
    @FocusState private var fieldFocused: Bool

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                switch phase {
                case .saving:
                    Skeleton()

                case .failed(let message):
                    Headline("Couldn't save")
                    Text(message)
                        .font(.cardo(15))
                        .foregroundStyle(Color.ink.opacity(0.65))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                    Button(action: done) {
                        Text("Close")
                            .font(.mierDemi(15))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 30)
                    .padding(.top, 22)

                case .ready(let state):
                    Headline(state.alreadySaved ? "Already in your Bulletin" : "Now publish to a list")
                    rows(state)
                }
            }
        }
        .task { await run() }
    }

    // MARK: - Pieces

    /// The one line above the rows. Mier DemiBold, centered, the band's voice.
    struct Headline: View {
        let text: String
        init(_ text: String) { self.text = text }
        var body: some View {
            Text(text)
                .font(.mierDemi(17))
                .foregroundStyle(Color.ink)
                .frame(maxWidth: .infinity)
                .padding(.top, 34)
                .padding(.bottom, 30)
        }
    }

    /// The saving state: headline over empty rows, so the reveal swaps
    /// content into a frame that's already there.
    struct Skeleton: View {
        var body: some View {
            VStack(spacing: 0) {
                Headline("Saving to your Bulletin…")
                Rectangle().fill(SaveCeremonyView.hairline).frame(height: 1)
                ForEach(0..<4, id: \.self) { _ in
                    Color.clear
                        .frame(height: SaveCeremonyView.rowHeight)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(SaveCeremonyView.hairline).frame(height: 1)
                        }
                }
            }
        }
    }

    private func rows(_ state: Ready) -> some View {
        let visible = showAll ? state.lists : Array(state.lists.prefix(Self.topRows))
        let folded = state.lists.count - visible.count
        return VStack(spacing: 0) {
            Rectangle().fill(Self.hairline).frame(height: 1)
            ForEach(visible) { list in
                listRow(list, on: state.memberOf.contains(list.id))
            }
            if folded > 0 {
                moreRow
            }
            createRow
        }
    }

    private func listRow(_ list: API.List, on: Bool) -> some View {
        Button {
            Task { await toggle(list, wasMember: on) }
        } label: {
            HStack(spacing: 14) {
                Text(list.name)
                    .font(.mier(17))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Spacer(minLength: 0)
                dot(on)
            }
            .padding(.horizontal, 30)
            .frame(height: Self.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Self.hairline).frame(height: 1)
        }
    }

    /// The extension's radio: a grey well, a black dot that scales in.
    private func dot(_ on: Bool) -> some View {
        ZStack {
            Circle().fill(Self.dotWell).frame(width: 17, height: 17)
            Circle().fill(Color.black).frame(width: 9, height: 9)
                .scaleEffect(on ? 1 : 0.001)
                .animation(.spring(response: 0.18, dampingFraction: 0.7), value: on)
        }
    }

    /// "All other lists" — tap swaps it for the rest of the rows. One-way.
    private var moreRow: some View {
        Button {
            showAll = true
        } label: {
            HStack(spacing: 14) {
                Text("All other lists")
                    .font(.mier(17))
                    .foregroundStyle(Color.ink)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.ink)
            }
            .padding(.horizontal, 30)
            .frame(height: Self.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Self.hairline).frame(height: 1)
        }
    }

    /// "Create new list" — a label that becomes a field in place; Return
    /// creates the list and files the bullet into it.
    private var createRow: some View {
        HStack(spacing: 14) {
            if creating {
                TextField("Name your list", text: $newName)
                    .font(.mier(17))
                    .foregroundStyle(Color.ink)
                    .focused($fieldFocused)
                    .submitLabel(.done)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await create() } }
                if let createHint {
                    Text(createHint)
                        .font(.cardo(14))
                        .foregroundStyle(Color.ink.opacity(0.45))
                } else {
                    Text("Press return")
                        .font(.cardo(14))
                        .foregroundStyle(Color.ink.opacity(0.45))
                }
            } else {
                Button {
                    creating = true
                    fieldFocused = true
                } label: {
                    HStack {
                        Text((ready?.lists.isEmpty ?? false) ? "Create your first list" : "Create new list")
                            .font(.mier(17))
                            .foregroundStyle(Color.ink)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 30)
        .frame(height: Self.rowHeight)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Self.hairline).frame(height: 1)
        }
    }

    // MARK: - Flow

    private func run() async {
        Session.shared.reloadFromDisk()
        guard Session.shared.isSignedIn else {
            phase = .failed("You're signed out. Open Bulletin to sign in, then try again.")
            return
        }

        do {
            // Lift page context from the device's own network position — the
            // phone's IP sees pages the server's datacenter fetch gets walled
            // off (Instagram-class sites).
            var title = self.title
            var meta = clientMeta
            if meta["title"] == nil || meta["image"] == nil {
                let probe = await PageProbe.fetch(url)
                title = title ?? probe.title
                meta.merge(probe.meta) { current, _ in current }
            }
            let saved = try await API.save(url: url, title: title, clientMeta: meta)
            let bookmarkId = saved.bookmark.id
            // Server order is recency (2026-09-22) — no client re-sort.
            let listsResponse = try await API.lists(bookmarkId: bookmarkId)
            let state = Ready(
                bookmarkId: bookmarkId,
                lists: listsResponse.lists,
                memberOf: Set(listsResponse.member_of ?? []),
                alreadySaved: saved.refreshed == true
            )
            ready = state
            phase = .ready(state)
        } catch API.APIError.alreadySaved {
            phase = .failed("Already in your Bulletin.")
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func toggle(_ list: API.List, wasMember: Bool) async {
        guard var state = ready else { return }
        if wasMember { state.memberOf.remove(list.id) } else { state.memberOf.insert(list.id) }
        ready = state
        phase = .ready(state)
        do {
            if wasMember {
                try await API.removeFromList(listId: list.id, bookmarkId: state.bookmarkId)
            } else {
                try await API.addToList(listId: list.id, bookmarkId: state.bookmarkId)
            }
        } catch {
            // Roll back the optimistic flip.
            if wasMember { state.memberOf.insert(list.id) } else { state.memberOf.remove(list.id) }
            ready = state
            phase = .ready(state)
        }
    }

    private func create() async {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, var state = ready else { return }
        createHint = "Creating…"
        do {
            let created = try await API.createList(named: name, bookmarkId: state.bookmarkId)
            let list = API.List(id: created.list.id, name: created.list.name, slug: created.list.slug)
            state.lists.removeAll { $0.id == list.id }
            state.lists.insert(list, at: 0)
            state.memberOf.insert(list.id)
            ready = state
            phase = .ready(state)
            newName = ""
            createHint = nil
            creating = false
            fieldFocused = false
        } catch {
            createHint = "Couldn't create — try again"
        }
    }
}
