import Foundation

// Mirror of lib/outboundUrl.ts's withBulletinUtm: outbound clicks carry
// render-time attribution, never persisted. A URL that already has a
// utm_source is left alone — two sources make both meaningless.
func withBulletinUtm(_ raw: String, campaign: String = "ios") -> URL? {
    guard var components = URLComponents(string: raw),
          components.scheme == "http" || components.scheme == "https"
    else { return URL(string: raw) }

    var items = components.queryItems ?? []
    if items.contains(where: { $0.name == "utm_source" }) {
        return components.url
    }
    items.append(.init(name: "utm_source", value: "bulletin"))
    items.append(.init(name: "utm_medium", value: "referral"))
    items.append(.init(name: "utm_campaign", value: campaign))
    components.queryItems = items
    return components.url
}
