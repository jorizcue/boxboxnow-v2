import SwiftUI

/**
 * Compact language switcher — a flag glyph that opens a Menu with the
 * five supported languages. Designed to live in a toolbar (HomeView's
 * trailing toolbar item).
 *
 * Mirrors the Android `LanguagePicker` composable: same flag-only
 * trigger, same dropdown of (flag · native-name) rows, same checkmark
 * on the currently-active language.
 *
 * The component reads / writes to the shared `LanguageStore`, so
 * flipping the language here automatically re-renders every view in
 * the app that observes `LanguageStore` via `@EnvironmentObject`.
 */
struct LanguagePicker: View {
    @EnvironmentObject private var lang: LanguageStore

    var body: some View {
        Menu {
            ForEach(Language.allCases, id: \.self) { option in
                Button(action: { lang.set(option) }) {
                    if option == lang.current {
                        Label("\(option.flag)  \(option.label)", systemImage: "checkmark")
                    } else {
                        Text("\(option.flag)  \(option.label)")
                    }
                }
            }
        } label: {
            Text(lang.current.flag)
                .font(.system(size: 20))
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color.white.opacity(0.06))
                .cornerRadius(8)
        }
    }
}
