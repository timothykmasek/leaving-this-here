import Foundation

// PageProbe — the extension fetches the shared page itself and lifts
// title + og tags. Why here and not the server: the save endpoint's own
// fetch comes from a datacenter IP that login-walled sites (Instagram, X…)
// stonewall, while this request rides the phone's residential IP with a
// Safari user-agent. Works for shares from ANY host app, which the
// Safari-only JS-preprocessing route never did (and that route's plist
// handoff is broken anyway — see Info.plist note).
enum PageProbe {
    private static let userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    static func fetch(_ urlString: String) async -> (title: String?, meta: [String: String]) {
        guard let url = URL(string: urlString) else { return (nil, [:]) }
        var request = URLRequest(url: url, timeoutInterval: 4)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")

        guard let (data, _) = try? await URLSession.shared.data(for: request) else {
            return (nil, [:])
        }
        let head = data.prefix(400_000)
        guard let html = String(data: head, encoding: .utf8)
            ?? String(data: head, encoding: .isoLatin1) else { return (nil, [:]) }

        var meta: [String: String] = [:]
        if let s = og(html, "title") { meta["title"] = s }
        if let s = og(html, "image") { meta["image"] = s }
        if let s = og(html, "description") { meta["description"] = s }
        return (first(html, pattern: "<title[^>]*>([\\s\\S]*?)</title>").map(clean), meta)
    }

    // <meta … property="og:x" … content="…"> with the attributes in either order.
    private static func og(_ html: String, _ prop: String) -> String? {
        guard let tag = first(html, pattern: "<meta[^>]+(?:property|name)=[\"']og:\(prop)[\"'][^>]*>")
            ?? first(html, pattern: "<meta[^>]+content=[^>]+(?:property|name)=[\"']og:\(prop)[\"'][^>]*>")
        else { return nil }
        return first(tag, pattern: "content=[\"']([^\"']*)[\"']").map(clean)
    }

    private static func first(_ text: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text))
        else { return nil }
        let idx = match.numberOfRanges > 1 ? 1 : 0
        guard let range = Range(match.range(at: idx), in: text) else { return nil }
        return String(text[range])
    }

    private static func clean(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // Numeric entities first (&#064; &#x2022; …) — Instagram's og:title is
        // full of them — then the common named ones.
        if let regex = try? NSRegularExpression(pattern: "&#(x?)([0-9a-fA-F]+);") {
            let matches = regex.matches(in: s, range: NSRange(s.startIndex..., in: s)).reversed()
            for match in matches {
                guard let full = Range(match.range, in: s),
                      let hexFlag = Range(match.range(at: 1), in: s),
                      let digits = Range(match.range(at: 2), in: s),
                      let code = UInt32(s[digits], radix: s[hexFlag].isEmpty ? 10 : 16),
                      let scalar = Unicode.Scalar(code)
                else { continue }
                s.replaceSubrange(full, with: String(Character(scalar)))
            }
        }
        for (entity, char) in [
            ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""),
            ("&apos;", "'"), ("&nbsp;", " "), ("&bull;", "•"),
            ("&mdash;", "—"), ("&ndash;", "–"),
        ] {
            s = s.replacingOccurrences(of: entity, with: char)
        }
        return s
    }
}
