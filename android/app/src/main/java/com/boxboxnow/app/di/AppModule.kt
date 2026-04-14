package com.boxboxnow.app.di

import android.content.Context
import com.boxboxnow.app.auth.BiometricService
import com.boxboxnow.app.ble.BleManager
import com.boxboxnow.app.gps.PhoneGpsManager
import com.boxboxnow.app.net.ApiClient
import com.boxboxnow.app.store.PreferencesStore
import com.boxboxnow.app.store.SecureTokenStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt bindings for singletons that need an app Context. ViewModels get these
 * via constructor injection (@HiltViewModel), which matches the iOS pattern of
 * having one AppState holding all service instances.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton
    fun provideSecureTokenStore(@ApplicationContext context: Context) = SecureTokenStore(context)

    @Provides @Singleton
    fun providePreferencesStore(@ApplicationContext context: Context) = PreferencesStore(context)

    @Provides @Singleton
    fun provideApiClient(tokenStore: SecureTokenStore) = ApiClient(tokenStore)

    @Provides @Singleton
    fun provideBleManager(@ApplicationContext context: Context) = BleManager(context)

    @Provides @Singleton
    fun providePhoneGpsManager(@ApplicationContext context: Context) = PhoneGpsManager(context)

    @Provides @Singleton
    fun provideBiometricService(@ApplicationContext context: Context) = BiometricService(context)
}
