import SwiftUI

/// Blocking screen shown when the backend has rejected this build as too
/// old (HTTP 426 from `/auth/login` or `/auth/register`). No retry / back
/// button — the only way out is to update from the App Store. Admins
/// bump the floor from the web Admin → Plataforma → "Apps móviles".
struct UpgradeRequiredView: View {
    let info: UpgradeRequiredInfo
    @EnvironmentObject var langStore: LanguageStore

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 72))
                .foregroundColor(.accentColor)
                .shadow(color: .accentColor.opacity(0.3), radius: 20)

            VStack(spacing: 8) {
                Text(t("update.title"))
                    .font(.title2.bold())
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)

                Text(info.message)
                    .font(.callout)
                    .foregroundColor(Color(.systemGray2))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            VStack(spacing: 4) {
                if let installed = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String {
                    metadataRow(label: t("update.installed"), value: installed)
                }
                if let min = info.minVersion {
                    metadataRow(label: t("update.minRequired"), value: min)
                }
                if let latest = info.latestVersion, latest != info.minVersion {
                    metadataRow(label: t("update.latest"), value: latest)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
            .background(Color(.systemGray6).opacity(0.3))
            .cornerRadius(10)
            .padding(.horizontal, 32)

            Button(action: openAppStore) {
                HStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.down")
                    Text(t("update.openStore"))
                        .font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(Color.accentColor)
                .foregroundColor(.black)
                .cornerRadius(10)
            }
            .padding(.horizontal, 32)
            .accessibilityLabel(t("update.openStore"))

            Spacer()
        }
        .padding(.vertical, 24)
    }

    private func metadataRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundColor(Color(.systemGray2))
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit())
                .foregroundColor(.white)
        }
        .padding(.vertical, 4)
    }

    private func openAppStore() {
        // Placeholder link — replace with the real App Store URL once the
        // app has an identifier assigned. Falls back to a search URL so
        // something opens either way.
        let appStoreURL = URL(string: "https://apps.apple.com/app/id0000000000")
        let searchURL = URL(string: "https://apps.apple.com/search?term=BoxBoxNow")!
        UIApplication.shared.open(appStoreURL ?? searchURL)
    }
}
