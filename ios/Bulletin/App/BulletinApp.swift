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
        if session.resolving {
            DotGround()
        } else if !session.isSignedIn {
            SignInView()
        } else if session.needsSetup {
            ClaimHandleView()
        } else {
            HomeView()
        }
    }
}

// Onboarding: the web's /start wizard, ported step for step. A first-time
// Apple or Google sign-in lands here (the account exists, the Bulletin
// doesn't): handle, then name/bio/links, then 2-3 interests, then pick 3
// links from the seed library, which become the first bullets in a starter
// list. Everything posts once, at the end, to /api/onboarding/setup (the
// route the web wizard ends on), so the page is identical either way.
// Lives in this file, not its own, so the Xcode project needs no regenerating.
struct ClaimHandleView: View {
    @EnvironmentObject private var session: Session

    enum Step: Int { case handle, about, interests, picks, building }
    enum Status: Equatable { case idle, short, checking, ok, taken, reserved, invalid }

    @State private var step: Step = .handle

    // handle
    @State private var handle = ""
    @State private var status: Status = .idle
    @State private var handleNote: String?
    @State private var check: Task<Void, Never>?

    // about
    @State private var name = ""
    @State private var bio = ""
    @State private var links: [String] = []
    @State private var linkDraft = ""
    @State private var linkInvalid = false
    static let bioMax = 120

    // interests + picks
    @State private var library: API.SeedLibrary?
    @State private var libraryFailed = false
    @State private var interests: [String] = []
    @State private var picks: [String] = []

    // building
    @State private var buildError: String?
    @State private var buildLine = 0
    private static let buildLines = [
        "reserving your handle", "pulling previews for your picks",
        "placing your first bullets", "starting a list for you", "tidying your shelf",
    ]

    var body: some View {
        ZStack {
            DotGround()
            switch step {
            case .handle: handleStep
            case .about: aboutStep
            case .interests: interestsStep
            case .picks: picksStep
            case .building: buildingStep
            }
        }
        .animation(.easeOut(duration: 0.2), value: step)
        // Fetch the library up front so the picks grid is ready by step four.
        .task { await loadLibrary() }
    }

    // MARK: - Chrome

    private func header(_ title: String, _ subtitle: String, back: Step? = nil) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Wordmark(height: 32)
                    .frame(maxWidth: .infinity)
                if let back {
                    HStack {
                        Button {
                            step = back
                        } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 17, weight: .regular))
                                .foregroundStyle(Color.ink.opacity(0.55))
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Back")
                        Spacer()
                    }
                    .padding(.leading, -14)
                }
            }
            .padding(.top, 24)

            Text(title)
                .font(.mier(28))
                .foregroundStyle(Color.ink)
                .padding(.top, 36)
            Text(subtitle)
                .font(.cardo(15))
                .foregroundStyle(Color.ink.opacity(0.55))
                .padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func primary(_ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.mierDemi(16))
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(.white)
                .opacity(enabled ? 1 : 0.5)
        }
        .disabled(!enabled)
    }

    private func field<F: View>(@ViewBuilder _ content: () -> F) -> some View {
        content()
            .font(.mier(16))
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(.mier(13))
            .foregroundStyle(Color.ink.opacity(0.5))
            .padding(.leading, 4)
    }

    // MARK: - 1. Handle

    private var handleStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            header("Pick your handle.", "This is your home on Bulletin. Share it anywhere.")

            field {
                HStack(spacing: 0) {
                    Text("yourbulletin.com/")
                        .foregroundStyle(Color.ink.opacity(0.4))
                    TextField("yourname", text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: handle) { _, raw in onHandle(raw) }
                }
            }
            .padding(.top, 24)

            Text(handleNote ?? message)
                .font(.mier(13))
                .foregroundStyle(status == .ok ? Color.green : status == .idle && handleNote == nil ? .clear : Color.ink.opacity(0.5))
                .frame(minHeight: 18)
                .padding(.top, 6)
                .padding(.leading, 4)

            primary("Continue", enabled: status == .ok) {
                if name.isEmpty { name = Self.titleCase(handle) }
                step = .about
            }
            .padding(.top, 20)

            Spacer()

            Button("Sign out") { session.signOut() }
                .font(.mier(14))
                .foregroundStyle(Color.ink.opacity(0.45))
                .frame(maxWidth: .infinity)
                .padding(.bottom, 12)
        }
        .padding(.horizontal, 28)
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
        handleNote = nil
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

    static func titleCase(_ handle: String) -> String {
        handle.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    // MARK: - 2. About

    private var aboutStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header("Introduce yourself.", "This sits at the top of your page.", back: .handle)

                label("Display name").padding(.top, 24)
                field {
                    TextField("Your name", text: $name)
                        .onChange(of: name) { _, v in if v.count > 60 { name = String(v.prefix(60)) } }
                }
                .padding(.top, 6)

                HStack {
                    label("Bio (optional)")
                    Spacer()
                    Text("\(bio.count)/\(Self.bioMax)")
                        .font(.mier(12))
                        .foregroundStyle(Color.ink.opacity(0.35))
                }
                .padding(.top, 18)
                field {
                    TextField("Head of Design @ Pentagram", text: $bio, axis: .vertical)
                        .lineLimit(1...3)
                        .padding(.vertical, 14)
                        .onChange(of: bio) { _, v in if v.count > Self.bioMax { bio = String(v.prefix(Self.bioMax)) } }
                }
                .padding(.top, 6)

                label("Links (optional)").padding(.top, 18)
                VStack(spacing: 8) {
                    ForEach(links, id: \.self) { link in
                        HStack(spacing: 12) {
                            Image("link-\(Self.platform(link))")
                                .resizable()
                                .renderingMode(.template)
                                .scaledToFit()
                                .frame(width: 15, height: 15)
                                .foregroundStyle(Color.ink.opacity(0.7))
                            Text(Self.linkLabel(link))
                                .font(.mier(15))
                                .foregroundStyle(Color.ink)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Spacer(minLength: 0)
                            Button {
                                links.removeAll { $0 == link }
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color.ink.opacity(0.45))
                                    .frame(width: 32, height: 32)
                            }
                            .accessibilityLabel("Remove link")
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 6)
                        .frame(height: 50)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(red: 0xE3 / 255, green: 0xE3 / 255, blue: 0xE3 / 255), lineWidth: 1))
                    }
                    if links.count < 12 {
                        field {
                            HStack(spacing: 8) {
                                TextField("+ Add a link (Instagram, X, your site…)", text: $linkDraft)
                                    .keyboardType(.URL)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .submitLabel(.done)
                                    .onSubmit { addDraftLink() }
                                    .onChange(of: linkDraft) { _, _ in linkInvalid = false }
                                if !linkDraft.trimmingCharacters(in: .whitespaces).isEmpty {
                                    Button("Add", action: addDraftLink)
                                        .font(.mierDemi(14))
                                        .foregroundStyle(Color.ink)
                                }
                            }
                        }
                    }
                }
                .padding(.top, 6)
                if linkInvalid {
                    Text("That doesn't look like a link")
                        .font(.mier(13))
                        .foregroundStyle(Color.ink.opacity(0.5))
                        .padding(.top, 6)
                        .padding(.leading, 4)
                }

                primary("Continue", enabled: !name.trimmingCharacters(in: .whitespaces).isEmpty) {
                    if !linkDraft.trimmingCharacters(in: .whitespaces).isEmpty { addDraftLink() }
                    step = .interests
                }
                .padding(.top, 28)
                .padding(.bottom, 40)
            }
            .padding(.horizontal, 28)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func addDraftLink() {
        guard let url = Self.coerceUrl(linkDraft) else {
            linkInvalid = !linkDraft.trimmingCharacters(in: .whitespaces).isEmpty
            return
        }
        if !links.contains(url), links.count < 12 { links.append(url) }
        linkDraft = ""
    }

    // The web's coerceUrl: add https:// when missing, require a dotted host.
    static func coerceUrl(_ raw: String) -> String? {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !t.contains(" ") else { return nil }
        let candidate = t.contains("://") ? t : "https://" + t
        guard let url = URL(string: candidate),
              url.scheme == "http" || url.scheme == "https",
              url.host?.contains(".") == true else { return nil }
        return candidate
    }

    // lib/profileLinks.ts, ported: the platform picks the row's icon (the
    // web's LINK_ICONS, as template assets), the label drops scheme, www,
    // and a trailing slash: "instagram.com/timmasek".
    static func platform(_ link: String) -> String {
        guard var host = URL(string: link)?.host?.lowercased() else { return "website" }
        if host.hasPrefix("www.") { host.removeFirst(4) }
        func on(_ d: String) -> Bool { host == d || host.hasSuffix("." + d) }
        if host == "x.com" || host == "twitter.com" { return "x" }
        if on("linkedin.com") { return "linkedin" }
        if on("instagram.com") { return "instagram" }
        if on("tiktok.com") { return "tiktok" }
        if on("substack.com") { return "substack" }
        if on("youtube.com") || host == "youtu.be" { return "youtube" }
        return "website"
    }

    static func linkLabel(_ link: String) -> String {
        var t = link
        if let r = t.range(of: #"^https?://"#, options: .regularExpression) { t.removeSubrange(r) }
        if t.hasPrefix("www.") { t.removeFirst(4) }
        if t.hasSuffix("/") { t.removeLast() }
        return t
    }

    // MARK: - 3. Interests

    private var interestsStep: some View {
        VStack(alignment: .leading, spacing: 0) {
            header("What are you into?", "Pick 2 or 3. We'll pull links to match, so your page starts as yours.", back: .about)

            if let library {
                FlowLayout(spacing: 8) {
                    ForEach(library.interests) { interest in
                        let on = interests.contains(interest.key)
                        let locked = !on && interests.count >= 3
                        Button {
                            if on { interests.removeAll { $0 == interest.key } }
                            else if !locked { interests.append(interest.key) }
                        } label: {
                            // Solid white even when locked: only the label
                            // fades, so the dot grid never shows through.
                            Text(interest.label)
                                .font(.mier(15))
                                .foregroundStyle(on ? Color.white : Color.ink.opacity(locked ? 0.3 : 1))
                                .padding(.horizontal, 16)
                                .frame(height: 40)
                                .background(on ? Color.ink : Color.white, in: Capsule())
                                .overlay(Capsule().stroke(Color.ink.opacity(on ? 0 : locked ? 0.1 : 0.18), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 24)
            } else {
                libraryPlaceholder.padding(.top, 40)
            }

            primary("Continue", enabled: interests.count >= 2) {
                picks = picks.filter { url in pool.contains { $0.url == url } }
                step = .picks
            }
            .padding(.top, 28)

            Spacer()
        }
        .padding(.horizontal, 28)
    }

    @ViewBuilder
    private var libraryPlaceholder: some View {
        if libraryFailed {
            VStack(alignment: .leading, spacing: 10) {
                Text("Couldn't load the picks. Check your connection.")
                    .font(.cardo(15))
                    .foregroundStyle(Color.ink.opacity(0.6))
                Button("Try again") { Task { await loadLibrary() } }
                    .font(.mier(15))
                    .foregroundStyle(Color.ink)
            }
        } else {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func loadLibrary() async {
        libraryFailed = false
        do { library = try await API.seedLibrary() } catch { libraryFailed = true }
    }

    // MARK: - 4. Picks

    // The web's pickPool: one queue per chosen interest in library order,
    // taken round-robin, duplicates dropped. No interests = the whole library.
    private var pool: [API.Seed] {
        guard let library else { return [] }
        if interests.isEmpty { return library.seeds }
        var queues = interests.map { key in library.seeds.filter { $0.interests.contains(key) } }
        var seen = Set<String>()
        var out: [API.Seed] = []
        while queues.contains(where: { !$0.isEmpty }) {
            for i in queues.indices where !queues[i].isEmpty {
                let s = queues[i].removeFirst()
                if seen.insert(s.url).inserted { out.append(s) }
            }
        }
        return out
    }

    private var picksSubtitle: String {
        let labels = interests.compactMap { key in library?.interests.first { $0.key == key }?.label }
        switch labels.count {
        case 0: return "A few favourites so your page isn't empty. You can swap them anytime."
        case 1: return "Because you like \(labels[0]). You can swap them anytime."
        case 2: return "Because you like \(labels[0]) and \(labels[1]). You can swap them anytime."
        default: return "Because you like \(labels[0]), \(labels[1]), and \(labels[2]). You can swap them anytime."
        }
    }

    private var picksStep: some View {
        ZStack(alignment: .bottom) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    header("Pick 3 to start.", picksSubtitle, back: .interests)
                    let seeds = pool
                    HStack(alignment: .top, spacing: 12) {
                        seedColumn(seeds.enumerated().filter { $0.offset % 2 == 0 }.map(\.element))
                        seedColumn(seeds.enumerated().filter { $0.offset % 2 == 1 }.map(\.element))
                    }
                    .padding(.top, 24)
                    .padding(.bottom, 120)
                }
                .padding(.horizontal, 20)
            }

            VStack(spacing: 10) {
                Text("\(picks.count) / 3 selected")
                    .font(.mier(13))
                    .foregroundStyle(Color.ink.opacity(0.55))
                primary("Build my Bulletin", enabled: picks.count == 3) {
                    step = .building
                    Task { await build() }
                }
            }
            .padding(.horizontal, 28)
            .padding(.top, 14)
            .padding(.bottom, 10)
            .background(.ultraThinMaterial)
        }
    }

    private func seedColumn(_ seeds: [API.Seed]) -> some View {
        LazyVStack(spacing: 16) {
            ForEach(seeds) { seed in
                let on = picks.contains(seed.url)
                SeedCard(seed: seed, selected: on, dimmed: !on && picks.count >= 3) {
                    if on { picks.removeAll { $0 == seed.url } }
                    else if picks.count < 3 { picks.append(seed.url) }
                }
            }
        }
    }

    // MARK: - 5. Building

    private var buildingStep: some View {
        VStack(spacing: 0) {
            Wordmark(height: 32)
                .padding(.top, 24)
            Spacer()
            if let buildError {
                VStack(spacing: 12) {
                    Text("That didn't take.")
                        .font(.mier(24))
                        .foregroundStyle(Color.ink)
                    Text(buildError)
                        .font(.cardo(15))
                        .foregroundStyle(Color.ink.opacity(0.6))
                        .multilineTextAlignment(.center)
                    primary("Try again", enabled: true) {
                        Task { await build() }
                    }
                    .padding(.top, 10)
                    Button("Back") { step = .picks }
                        .font(.mier(14))
                        .foregroundStyle(Color.ink.opacity(0.5))
                        .padding(.top, 4)
                }
                .padding(.horizontal, 28)
            } else {
                ProgressView()
                Text("Building your Bulletin…")
                    .font(.mier(20))
                    .foregroundStyle(Color.ink)
                    .padding(.top, 18)
                Text(Self.buildLines[buildLine % Self.buildLines.count])
                    .font(.cardo(15))
                    .foregroundStyle(Color.ink.opacity(0.5))
                    .padding(.top, 6)
                    .id(buildLine)
                    .transition(.opacity)
            }
            Spacer()
            Spacer()
        }
        .task(id: step) {
            while step == .building, buildError == nil, !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(700))
                withAnimation { buildLine += 1 }
            }
        }
    }

    private func build() async {
        buildError = nil
        do {
            // Success notes the username on the session, which clears
            // needsSetup and swaps RootView over to Home, picks and all.
            _ = try await API.setUp(
                handle: handle,
                displayName: name.trimmingCharacters(in: .whitespaces),
                bio: bio.trimmingCharacters(in: .whitespacesAndNewlines),
                links: links,
                picks: picks
            )
        } catch API.APIError.http(409, _) {
            status = .taken
            handleNote = "✕ Someone just took that one. Try another."
            step = .handle
        } catch {
            buildError = error.localizedDescription
        }
    }
}

// A seed in the pick grid: the baked preview plate, title, domain; a black
// ring and check when chosen. Plates hold one aspect so the grid reads calm.
struct SeedCard: View {
    let seed: API.Seed
    let selected: Bool
    let dimmed: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            VStack(alignment: .leading, spacing: 0) {
                Color.cardGrey
                    .aspectRatio(4.0 / 3.0, contentMode: .fit)
                    .overlay(
                        AsyncImage(url: URL(string: seed.image)) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                Text(seed.domain)
                                    .font(.mier(12))
                                    .foregroundStyle(Color.ink.opacity(0.35))
                            }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(selected ? Color.ink : Color.black.opacity(0.08), lineWidth: selected ? 2.5 : 1)
                    )
                    .overlay(alignment: .topTrailing) {
                        if selected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 26, height: 26)
                                .background(Color.ink, in: Circle())
                                .padding(8)
                        }
                    }

                Text(seed.title)
                    .font(.mier(13))
                    .foregroundStyle(Color.ink.opacity(0.75))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 8)
                Text(seed.domain)
                    .font(.cardo(12))
                    .foregroundStyle(Color.ink.opacity(0.4))
                    .padding(.top, 2)
            }
            .opacity(dimmed ? 0.4 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// Wrapping row layout for the interest chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
