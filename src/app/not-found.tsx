import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#FAF9F7]">
      {/* Logo mark */}
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-8 shadow-lg">
        <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      </div>

      <h1
        className="text-4xl font-semibold text-[#1A1A1A] mb-3"
        style={{ fontFamily: "'Fraunces', serif", letterSpacing: '-0.02em' }}
      >
        Page not found
      </h1>
      <p className="text-[#6B7280] text-center max-w-md mb-8" style={{ fontFamily: "'Inter', sans-serif" }}>
        Looks like you took a wrong turn. The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/dashboard"
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="px-6 py-2.5 rounded-xl text-sm font-medium text-[#374151] bg-white border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors"
        >
          Go Home
        </Link>
      </div>

      <a
        href="mailto:support@sunstonepj.com"
        className="mt-6 text-sm text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
      >
        Contact Support
      </a>
    </div>
  );
}
