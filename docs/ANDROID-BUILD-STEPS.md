# RideMate Android build steps

This package is Capacitor-ready. To create a real Android app:

1. Install Node.js 20 and Android Studio.
2. Extract this project.
3. Run:
   npm install
   npm run build
   npx cap add android
   npx cap sync android
   npx cap open android
4. In Android Studio:
   - Let Gradle sync complete.
   - Build > Generate Signed Bundle / APK.
   - Choose Android App Bundle (AAB) for Play Store or APK for direct install.

Important:
- First deploy/test the web app on Netlify.
- Keep Supabase URL and publishable key in Netlify environment variables.
- For Android native build, create a production `.env` locally before `npm run build`.
