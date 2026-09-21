import SwiftUI

// The save flow — Bulletin's "Good find!" moment, under the one-frame rule
// the Chrome extension shipped with (0.4.3): hold a quiet "Saving…" card
// until the save AND the list rows AND the one suggestion are all ready,
// then reveal everything in a single paint. No skeletons, no reflow.
struct SaveFlowView: View {
    let payload: SharePayload
    let done: () -> Void

    enum Phase {
        case saving
        case ready(Ready)
        case failed(String)
    }

    struct Ready {
        var bookmarkId: String
        var domain: String
        var lists: [API.List]
        var memberOf: Set<String>
        var suggestion: String?
        var alreadySaved: Bool
    }

    @State private var phase: Phase = .saving
    @State private var ready: Ready?
    @State private var creatingSuggested = false

    var body: some View {
        VStack {
            Spacer()
            card
                .padding(.horizontal, 20)
            Spacer().frame(height: 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.18).ignoresSafeArea())
        .task { await run() }
    }

    @ViewBuilder
    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch phase {
            case .saving:
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Saving…")
                        .font(.system(size: 15, design: .serif))
                        .foregroundStyle(Color.ink.opacity(0.55))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 36)

            case .failed(let message):
                Text(message)
                    .font(.system(size: 15, design: .serif))
                    .foregroundStyle(Color.ink.opacity(0.65))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
                doneButton(label: "Close")

            case .ready(let state):
                Text(state.alreadySaved ? "Already in your bulletin." : "In your bulletin.")
                    .font(.system(size: 22, design: .serif))
                    .foregroundStyle(Color.ink)
                Text(state.domain)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(Color.ink.opacity(0.4))
                    .padding(.top, 2)

                if !state.lists.isEmpty || state.suggestion != nil {
                    VStack(spacing: 0) {
                        ForEach(state.lists.prefix(4)) { list in
                            listRow(list, state: state)
                        }
                        if let suggestion = state.suggestion {
                            suggestionRow(suggestion, state: state)
                        }
                    }
                    .padding(.top, 14)
                }

                doneButton(label: "Done")
            }
        }
        .padding(22)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
    }

    private func doneButton(label: String) -> some View {
        Button(action: done) {
            Text(label)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)
        }
        .padding(.top, 18)
    }

    private func listRow(_ list: API.List, state: Ready) -> some View {
        let isMember = state.memberOf.contains(list.id)
        return Button {
            Task { await toggle(list, wasMember: isMember) }
        } label: {
            HStack {
                Text(list.name)
                    .font(.system(size: 15))
                    .foregroundStyle(Color.ink.opacity(0.8))
                Spacer()
                Image(systemName: isMember ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isMember ? Color.ink : Color.ink.opacity(0.25))
            }
            .padding(.vertical, 10)
        }
    }

    private func suggestionRow(_ name: String, state: Ready) -> some View {
        Button {
            Task { await createSuggested(name) }
        } label: {
            HStack(spacing: 6) {
                if creatingSuggested {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .semibold))
                }
                Text(name)
                    .font(.system(size: 15))
                Spacer()
            }
            .foregroundStyle(Color.ink.opacity(0.55))
            .padding(.vertical, 10)
        }
        .disabled(creatingSuggested)
    }

    // MARK: - Flow

    private func run() async {
        guard Session.shared.isSignedIn else {
            phase = .failed("You're signed out. Open Bulletin to sign in, then share again.")
            return
        }
        guard let shared = await payload.resolve() else {
            phase = .failed("Couldn't find a link in what was shared.")
            return
        }
        let domain = URL(string: shared.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? shared.url

        do {
            let saved = try await API.save(url: shared.url, title: shared.title)
            let bookmarkId = saved.bookmark.id
            // One paint: both follow-ups land before anything shows.
            async let listsTask = API.lists(bookmarkId: bookmarkId)
            async let suggestTask = try? API.suggestListName(bookmarkId: bookmarkId)
            let (listsResponse, suggestion) = try await (listsTask, suggestTask)

            let existingNames = Set(listsResponse.lists.map { $0.name.lowercased() })
            let freshSuggestion = suggestion?.name.flatMap {
                existingNames.contains($0.lowercased()) ? nil : $0
            }
            var state = Ready(
                bookmarkId: bookmarkId,
                domain: domain,
                lists: listsResponse.lists,
                memberOf: Set(listsResponse.member_of ?? []),
                suggestion: freshSuggestion,
                alreadySaved: saved.refreshed == true
            )
            // Filed lists float to the top so a re-save shows its homes first.
            state.lists.sort { state.memberOf.contains($0.id) && !state.memberOf.contains($1.id) }
            ready = state
            phase = .ready(state)
        } catch API.APIError.alreadySaved {
            phase = .failed("Already in your bulletin.")
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

    private func createSuggested(_ name: String) async {
        guard var state = ready else { return }
        creatingSuggested = true
        do {
            let created = try await API.createList(named: name, bookmarkId: state.bookmarkId)
            state.lists.insert(.init(id: created.list.id, name: created.list.name, slug: created.list.slug), at: 0)
            state.memberOf.insert(created.list.id)
            state.suggestion = nil
            ready = state
            phase = .ready(state)
        } catch {
            // Leave the chip; a retry is one tap.
        }
        creatingSuggested = false
    }
}
