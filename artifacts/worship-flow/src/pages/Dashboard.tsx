import { AppLayout } from '../components/layout/AppLayout';
import { Layers, Music, BookOpen, Mic, Users, Calendar, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@clerk/react';
import { useGetDashboard } from '@workspace/api-client-react';
import { OnboardingBanner } from '../components/OnboardingBanner';

export default function Dashboard() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const { data: dashboard, isLoading } = useGetDashboard();

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || 'Pastor';

  if (isLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-10">

        <OnboardingBanner />

        {/* Welcome Section */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b" style={{ borderColor: 'var(--worship-border)' }}>
          <div>
            <h1 className="text-3xl mb-2 font-serif text-[var(--worship-navy)]">Welcome back, {firstName}.</h1>
            <p className="text-lg mb-4" style={{ color: 'var(--worship-slate)' }}>What are you planning this week?</p>
            {dashboard?.verseOfDay && (
              <p className="text-sm italic max-w-2xl" style={{ color: 'var(--worship-muted-slate)', fontFamily: 'var(--font-serif)' }}>
                "{dashboard.verseOfDay.text}" — {dashboard.verseOfDay.reference}
              </p>
            )}
          </div>
          <div className="flex gap-4">
            <Link href="/generators/liturgy" className="px-6 py-2.5 rounded-xl font-medium worship-btn-outline flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4" /> Generate Liturgy
            </Link>
            <Link href="/service-builder" className="px-6 py-2.5 rounded-xl font-medium worship-btn-primary flex items-center gap-2 shadow-md text-sm">
              <Layers className="w-4 h-4" /> Build a Service
            </Link>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { icon: Layers, label: "Build a Service", href: "/service-builder" },
              { icon: BookOpen, label: "Generate Liturgy", href: "/generators/liturgy" },
              { icon: Music, label: "Find Songs", href: "/generators/songs" },
              { icon: Users, label: "Team Devotional", href: "/generators/devotional" },
              { icon: Mic, label: "Speaking Moment", href: "/generators/speaking-moment" }
            ].map((action, i) => (
              <Link key={i} href={action.href} className="worship-card flex flex-col items-center justify-center gap-3 p-4 hover:-translate-y-1 transition-transform">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-center" style={{ color: 'var(--worship-charcoal)' }}>{action.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Recent Services */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--worship-muted-slate)' }}>Recent Services</h2>
            <Link href="/services" className="text-sm font-medium flex items-center gap-1 hover:underline" style={{ color: 'var(--worship-navy)' }}>
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          
          {!dashboard?.recentServices?.length ? (
             <div className="worship-card p-8 flex flex-col items-center justify-center text-center">
               <FileText className="w-12 h-12 mb-4 text-[var(--worship-gold)] opacity-50" />
               <p className="text-[var(--worship-slate)] font-medium mb-4">No services planned yet.</p>
               <Link href="/service-builder" className="worship-btn-outline px-4 py-2 rounded-lg text-sm">Build your first service</Link>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {dashboard.recentServices.map((service) => (
                <div 
                  key={service.id} 
                  onClick={() => setLocation(`/services/${service.id}`)}
                  className="worship-card cursor-pointer group hover:border-[var(--worship-gold)] transition-colors"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--worship-cream)]">
                      <FileText className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                    </div>
                    <span className="text-xs font-medium px-2 py-1 rounded bg-[var(--worship-cream)]" style={{ color: 'var(--worship-slate)' }}>
                      {service.serviceDate ? new Date(service.serviceDate).toLocaleDateString() : 'Unscheduled'}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg mb-1 font-serif" style={{ color: 'var(--worship-navy)' }}>{service.title}</h3>
                  <p className="text-sm mb-4 truncate" style={{ color: 'var(--worship-slate)' }}>{service.scripture || 'No scripture set'}</p>
                  
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-[var(--worship-sand)]" style={{ color: 'var(--worship-navy)' }}>{service.theme || 'General'}</span>
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-gold)' }}>{service.season || 'Ordinary Time'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seasonal Prompts */}
        {dashboard?.suggestions && dashboard.suggestions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Ideas For You</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {dashboard.suggestions.map((suggestion) => {
                let href = "/service-builder";
                if (suggestion.kind === "liturgy") href = "/generators/liturgy";
                if (suggestion.kind === "songs") href = "/generators/songs";
                if (suggestion.kind === "speaking_moment") href = "/generators/speaking-moment";
                if (suggestion.kind === "devotional") href = "/generators/devotional";
                if (suggestion.kind === "soul_care") href = "/generators/soul-care";
                
                return (
                  <Link 
                    key={suggestion.id} 
                    href={`${href}?prompt=${encodeURIComponent(suggestion.prompt)}`}
                    className="text-left p-4 rounded-xl border flex items-start gap-3 group transition-colors hover:bg-[#F8F4EA]" 
                    style={{ backgroundColor: 'var(--worship-white)', borderColor: 'var(--worship-border)' }}
                  >
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--worship-gold)' }} />
                    <span className="text-sm font-medium group-hover:underline decoration-[var(--worship-gold)]" style={{ color: 'var(--worship-charcoal)' }}>
                      {suggestion.prompt}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        
        {/* Stats */}
        {dashboard && (
          <div className="pt-8 flex items-center gap-6 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
            <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {dashboard.servicesThisMonth} plans created this month</span>
            <span className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> {dashboard.librarySize} items in library</span>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
