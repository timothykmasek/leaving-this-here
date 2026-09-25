import SwiftUI

// The web ImportFab, ported by measurement (components/ImportFab.tsx): a
// 56pt frosted tile bottom-right that blooms into a frosted paste bar. One
// element morphs between both dresses — radius, frost, and shadow ride the
// width transition untouched — and the plus rotates 45° into the ×, never a
// glyph swap. Cardo in the bar, paste-and-done on a valid link.
struct ImportFab: View {
    /// Called with a normalized URL; the owner presents the save ceremony.
    var onSubmit: (String) -> Void

    @State private var open = false
    @State private var value = ""
    @State private var showInvalid = false
    @FocusState private var focused: Bool

    private let curve = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.34)

    var body: some View {
        HStack(spacing: 0) {
            if open {
                Group {
                    if showInvalid {
                        Text("That doesn’t look like a link")
                            .font(.cardo(16))
                            .foregroundStyle(Color.black.opacity(0.6))
                            .lineLimit(1)
                    } else {
                        TextField("Paste a link", text: $value)
                            .font(.cardo(16))
                            .foregroundStyle(Color.ink)
                            .tint(Color.ink)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .submitLabel(.go)
                            .focused($focused)
                            .onSubmit(submit)
                            // Paste-and-done, the web bar's trick: a valid
                            // link arriving in one jump (a paste, not a
                            // keystroke) saves the moment it lands.
                            .onChange(of: value) { old, new in
                                if new.count > old.count + 5, parseOneUrl(new) != nil {
                                    submit()
                                }
                            }
                    }
                }
                .padding(.leading, 20)

                Spacer(minLength: 8)

                Button(action: close) {
                    PlusGlyph()
                        .rotationEffect(.degrees(45))
                        .foregroundStyle(Color.ink.opacity(0.6))
                        .frame(width: 56, height: 56)
                }
            } else {
                Button(action: bloom) {
                    PlusGlyph()
                        .foregroundStyle(Color.ink.opacity(0.75))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                }
            }
        }
        .frame(height: 56)
        .frame(maxWidth: open ? .infinity : 56, alignment: .leading)
        .background(frost)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        // Frost alone vanishes on an empty white page (App Review missed the
        // button), so the tile carries a hairline and a lift of its own.
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.black.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        .animation(curve, value: open)
    }

    // The handoff's frost: radial dark-glass gradient from the top-left over
    // blur, a milk layer on top when open (Cardo needs a calmer ground than
    // raw blur over photo cards), and the inner white sheen up top.
    private var frost: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial)
            RadialGradient(
                colors: [.black.opacity(0.03), .black.opacity(0.067), .clear],
                center: .topLeading, startRadius: 0, endRadius: 260
            )
            if open { Color.white.opacity(0.6) }
            LinearGradient(
                colors: [.white.opacity(0.55), .clear],
                startPoint: .top, endPoint: .center
            )
            .blendMode(.plusLighter)
            .opacity(0.5)
        }
    }

    private func bloom() {
        open = true
        // Focus once the bar has stretched; focusing mid-morph fights the
        // keyboard animation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { focused = true }
    }

    private func close() {
        open = false
        value = ""
        showInvalid = false
        focused = false
    }

    private func submit() {
        guard let url = parseOneUrl(value) else {
            if !value.trimmingCharacters(in: .whitespaces).isEmpty {
                showInvalid = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                    showInvalid = false
                    focused = true
                }
            }
            return
        }
        close()
        onSubmit(url)
    }

    // One URL out of whatever was pasted or typed — the web's parseOneUrl,
    // forgiving the same ways: strip quote/bracket dress, pass http(s)
    // through, give a bare domain its https://.
    private func parseOneUrl(_ raw: String) -> String? {
        var t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        t = t.trimmingCharacters(in: CharacterSet(charactersIn: "\"'<>,;."))
        guard !t.isEmpty, !t.contains(" ") else { return nil }
        let candidate: String
        if t.contains("://") {
            candidate = t
        } else if t.range(of: #"^[\w-]+(\.[\w-]+)+([/?#]\S*)?$"#, options: .regularExpression) != nil {
            candidate = "https://" + t
        } else {
            return nil
        }
        guard let url = URL(string: candidate),
              url.scheme == "http" || url.scheme == "https",
              url.host?.contains(".") == true
        else { return nil }
        return candidate
    }
}

// The plus as two bars rather than a glyph, so the stroke stays exactly 2pt
// and the arms stay exactly equal — a font's "+" gives neither. The same
// bars serve plus and × via rotation.
struct PlusGlyph: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 1)
                .frame(width: 16, height: 2)
            RoundedRectangle(cornerRadius: 1)
                .frame(width: 2, height: 16)
        }
    }
}
