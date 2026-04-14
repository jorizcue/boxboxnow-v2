# Keep Kotlinx Serialization metadata
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.boxboxnow.app.**$$serializer { *; }
-keepclassmembers class com.boxboxnow.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.boxboxnow.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
