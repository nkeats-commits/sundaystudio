import React from 'react';
import { AppLayout } from './_shared/AppLayout';
import { Layers, Music, BookOpen, Mic, Users, Calendar, ChevronRight, FileText } from 'lucide-react';
import './_group.css';

export default function Dashboard() {
  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-10">
        
        {/* Welcome Section */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b" style={{ borderColor: 'var(--worship-border)' }}>
          <div>
            <h1 className="text-3xl mb-2">Welcome back, Pastor Sarah.</h1>
            <p className="text-lg mb-4" style={{ color: 'var(--worship-slate)' }}>What are you planning this week?</p>
            <p className="text-sm italic" style={{ color: 'var(--worship-muted-slate)', fontFamily: 'var(--font-serif)' }}>
              "Let the message of Christ dwell among you richly..." — Colossians 3:16
            </p>
          </div>
          <div className="flex gap-4">
            <button className="px-6 py-2.5 rounded-xl font-medium worship-btn-outline flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Generate Liturgy
            </button>
            <button className="px-6 py-2.5 rounded-xl font-medium worship-btn-primary flex items-center gap-2 shadow-md">
              <Layers className="w-4 h-4" /> Build a Service
            </button>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { icon: Layers, label: "Build Service" },
              { icon: BookOpen, label: "Generate Liturgy" },
              { icon: Music, label: "Find Songs" },
              { icon: Users, label: "Team Devotional" },
              { icon: Mic, label: "Speaking Moment" }
            ].map((action, i) => (
              <button key={i} className="worship-card flex flex-col items-center justify-center gap-3 p-4 hover:-translate-y-1 transition-transform">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-center" style={{ color: 'var(--worship-charcoal)' }}>{action.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent Services */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--worship-muted-slate)' }}>Recent Services</h2>
            <button className="text-sm font-medium flex items-center gap-1 hover:underline" style={{ color: 'var(--worship-navy)' }}>
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: "Sunday Morning Service", date: "Nov 12, 2023", scripture: "Romans 8:1-11", theme: "Grace", season: "Ordinary Time" },
              { title: "First Sunday of Advent", date: "Dec 3, 2023", scripture: "Isaiah 9:2-7", theme: "Hope", season: "Advent" },
              { title: "Night of Worship", date: "Nov 29, 2023", scripture: "Psalm 150", theme: "Praise", season: "Special" }
            ].map((service, i) => (
              <div key={i} className="worship-card cursor-pointer group hover:border-[var(--worship-gold)] transition-colors">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--worship-cream)]">
                    <FileText className="w-5 h-5" style={{ color: 'var(--worship-gold)' }} />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded bg-[var(--worship-cream)]" style={{ color: 'var(--worship-slate)' }}>
                    {service.date}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--worship-navy)' }}>{service.title}</h3>
                <p className="text-sm mb-4" style={{ color: 'var(--worship-slate)' }}>{service.scripture}</p>
                
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-[var(--worship-sand)]" style={{ color: 'var(--worship-navy)' }}>{service.theme}</span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-gold)' }}>{service.season}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Seasonal Prompts */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--worship-muted-slate)' }}>Ideas For You</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              "Plan an Advent service around hope",
              "Create a communion invitation",
              "Find songs about surrender",
              "Write a rehearsal devotional on humility"
            ].map((prompt, i) => (
              <button key={i} className="text-left p-4 rounded-xl border flex gap-3 group transition-colors" style={{ backgroundColor: 'var(--worship-white)', borderColor: 'var(--worship-border)' }}>
                <span className="mt-0.5" style={{ color: 'var(--worship-gold)' }}>✨</span>
                <span className="text-sm font-medium group-hover:underline decoration-[var(--worship-gold)]" style={{ color: 'var(--worship-charcoal)' }}>{prompt}</span>
              </button>
            ))}
          </div>
        </section>
        
        {/* Stats (Tasteful) */}
        <div className="pt-8 flex items-center gap-6 text-sm" style={{ color: 'var(--worship-muted-slate)' }}>
          <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> 4 plans created this month</span>
          <span className="flex items-center gap-2"><Music className="w-4 h-4" /> 12 new songs discovered</span>
        </div>

      </div>
    </AppLayout>
  );
}
