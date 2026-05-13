import SwiftUI

/// Compact language switcher — a flag glyph that opens a Menu with
/// the five supported languages. Used in HomeView's toolbar and in
/// LoginView's header so the user can change idioma even before
/// signing in.
///
/// State source: `LanguageStore.shared`, mounted as an
/// `@EnvironmentObject` at the App root. Flipping `lang` triggers a
/// re-render of every view that reads `t(_:)`.
struct LanguagePicker: View {
    @EnvironmentObject private var lang: LanguageStore

    var body: some View {
        Menu {
            ForEach(Language.allCases) { option in
                Button(action: { lang.lang = option }) {
                    HStack {
                        Text("\(option.flag)  \(option.label)")
                        if lang.lang == option {
                            Spacer()
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            // Flag-only trigger to keep the toolbar compact. The
            // selection check inside the menu confirms the active
            // language when the menu is opened.
            Text(lang.lang.flag)
                .font(.system(size: 22))
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.06))
                .cornerRadius(8)
                .accessibilityLabel(t("common.language"))
        }
    }
}
