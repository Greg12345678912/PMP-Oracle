export const metadata = {
  title: 'Privacy Policy — Pretty Much Picks',
  description: 'Privacy Policy for Pretty Much Picks (prettymuchpicks.ca).',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-pmp-black">
      <div className="px-4 py-10 max-w-lg mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">Pretty Much Picks</p>
          <h1 className="text-pmp-white font-black text-3xl leading-tight">Privacy Policy</h1>
          <p className="text-pmp-gray-500 text-sm">Last updated: August 04, 2026</p>
        </div>

        <div className="flex flex-col gap-6 text-pmp-gray-400 text-sm leading-relaxed">

          <section className="flex flex-col gap-2">
            <p>
              This Privacy Policy describes how Pretty Much Picks (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and discloses your information when you use our service at prettymuchpicks.ca, and tells you about your privacy rights.
            </p>
            <p>
              By using the Service, you agree to the collection and use of information in accordance with this Privacy Policy.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Information We Collect</h2>
            <p>When you create an account or use our Service, we may collect:</p>
            <ul className="flex flex-col gap-1 pl-4 list-disc">
              <li>Your name and email address (via Google sign-in)</li>
              <li>Fantasy rankings you submit through the Oracle Challenge</li>
              <li>Usage data such as pages visited, time spent, and browser/device information</li>
              <li>IP address and device identifiers</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="flex flex-col gap-1 pl-4 list-disc">
              <li>Provide and operate the Service</li>
              <li>Manage your account and Oracle Challenge entry</li>
              <li>Display leaderboards and scoring results</li>
              <li>Contact you regarding your entry or service updates</li>
              <li>Improve the Service</li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Cookies and Tracking</h2>
            <p>
              We use session and persistent cookies for authentication and to remember your preferences. We also use analytics tools (including Google Analytics) to understand how the Service is used. You can instruct your browser to refuse cookies, though some parts of the Service may not function properly as a result.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Data Sharing</h2>
            <p>
              We do not sell your personal information. We may share information with third-party service providers that help us operate the Service (such as Supabase for database hosting and Vercel for infrastructure). These providers are only given access to the information necessary to perform their services.
            </p>
            <p>
              Your display name and Oracle Challenge rankings may be visible to other users on public leaderboards.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Data Retention</h2>
            <p>
              We retain your account data for up to 24 months after account closure. Usage data is retained for up to 24 months. We may retain data longer where required by law or for legitimate business purposes.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data at any time by contacting us at prettymuchpicks@gmail.com. You may also delete your account through the Service settings.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Children&apos;s Privacy</h2>
            <p>
              The Service is not directed to individuals under the age of 16. We do not knowingly collect personal information from children under 16.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Third-Party Links</h2>
            <p>
              The Service may contain links to third-party websites. We are not responsible for the privacy practices of those sites and encourage you to review their privacy policies.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page with an updated date. Continued use of the Service after changes are posted constitutes your acceptance of the updated policy.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-pmp-white font-bold text-base">Contact</h2>
            <p>
              If you have any questions about this Privacy Policy, you can contact us at:{' '}
              <a href="mailto:prettymuchpicks@gmail.com" className="text-pmp-red hover:underline">
                prettymuchpicks@gmail.com
              </a>
            </p>
            <p className="text-pmp-gray-600 text-xs">Pretty Much Picks · Quebec, Canada · prettymuchpicks.ca</p>
          </section>

        </div>
      </div>
    </div>
  )
}
