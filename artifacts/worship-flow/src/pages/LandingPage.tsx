import { useState } from 'react';
import { Flame, CheckCircle2, ChevronRight, Music, Mic, Users, Calendar, BookOpen, Layers } from 'lucide-react';
import { Link } from 'wouter';

export default function LandingPage() {
  return (
    <div className="worship-theme min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 absolute top-0 w-full z-10">
        <div className="flex items-center gap-2">
          <Flame className="w-6 h-6" style={{ color: 'var(--worship-gold)' }} />
          <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--worship-navy)', fontFamily: 'var(--font-serif)' }}>
            WorshipFlow
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/sign-in" className="text-sm font-medium" style={{ color: 'var(--worship-slate)' }}>Sign In</Link>
          <Link href="/sign-up" className="px-5 py-2.5 rounded-full text-sm font-medium worship-btn-primary">
            Start Planning
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-8 overflow-hidden flex flex-col items-center text-center">
        <div className="absolute inset-0 z-0 opacity-40 bg-gradient-to-b from-[#E8DDC7] to-[#F8F4EA]" />
        
        <div className="relative z-10 max-w-4xl mx-auto mt-16">
          <span className="px-4 py-1.5 rounded-full text-sm font-medium mb-6 inline-block shadow-sm" style={{ backgroundColor: 'var(--worship-white)', color: 'var(--worship-navy)' }}>
            A new standard for ministry planning
          </span>
          <h1 className="text-6xl md:text-7xl font-medium leading-tight mb-6">
            Plan worship with depth, <br/>
            <span style={{ color: 'var(--worship-gold)' }}>not panic.</span>
          </h1>
          <p className="text-xl max-w-2xl mx-auto mb-10 leading-relaxed" style={{ color: 'var(--worship-slate)' }}>
            AI-powered tools for songs, liturgy, devotionals, and service flow. Built for worship pastors, creative teams, and church leaders who want more than a song list.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up" className="px-8 py-4 rounded-full text-base font-medium worship-btn-primary shadow-lg flex items-center gap-2">
              Start Planning <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="/sign-in" className="px-8 py-4 rounded-full text-base font-medium bg-white shadow-sm flex items-center gap-2" style={{ color: 'var(--worship-navy)' }}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-white)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl mb-6">You're not just picking songs. You're pastoring a room.</h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--worship-slate)' }}>
            Every Sunday matters. But the pressure of planning week after week can turn a sacred calling into a frantic scramble. WorshipFlow moves you from scattered ideas to thoughtful, theologically rich service plans—so you can lead with peace, presence, and purpose.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-cream)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl mb-4">Everything you need to plan well</h2>
            <p className="text-lg" style={{ color: 'var(--worship-slate)' }}>Purpose-built tools for the whole creative team.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: Layers, title: "Worship Service Builder", desc: "Craft seamless transitions and intentional service arcs." },
              { icon: Music, title: "Song Selection Assistant", desc: "Find the perfect songs based on theme, scripture, and mood." },
              { icon: BookOpen, title: "Liturgy Generator", desc: "Write beautiful prayers, calls to worship, and benedictions." },
              { icon: Mic, title: "Speaking Moments", desc: "Draft thoughtful setups for communion, offering, and transitions." },
              { icon: Users, title: "Team Devotionals", desc: "Lead your team spiritually with custom rehearsal devotionals." },
              { icon: Calendar, title: "Seasonal Planning", desc: "Plan ahead for Advent, Lent, Easter, and special series." }
            ].map((feature, i) => (
              <div key={i} className="worship-card hover:-translate-y-1 transition-transform duration-300">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6" style={{ backgroundColor: 'var(--worship-pale-gold)', color: 'var(--worship-navy)' }}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3 font-sans" style={{ color: 'var(--worship-charcoal)' }}>{feature.title}</h3>
                <p className="text-base" style={{ color: 'var(--worship-slate)' }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-8" style={{ backgroundColor: 'var(--worship-navy)', color: 'white' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl mb-4 font-serif text-white">How it works</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { step: "1", title: "Add your context", desc: "Input the sermon topic, scripture passage, and your church's specific tradition." },
              { step: "2", title: "Generate thoughtful content", desc: "WorshipFlow suggests songs, liturgy, and a cohesive service arc." },
              { step: "3", title: "Edit, save, and lead", desc: "Refine the suggestions, export to Planning Center, and lead with confidence." }
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center relative">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-serif mb-6" style={{ backgroundColor: 'var(--worship-gold)', color: 'var(--worship-navy)' }}>
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold mb-3 font-sans text-white">{step.title}</h3>
                <p className="text-slate-300">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8 text-center" style={{ backgroundColor: 'var(--worship-sand)' }}>
        <h2 className="text-4xl md:text-5xl font-medium mb-8 max-w-2xl mx-auto">Stop starting from scratch every week.</h2>
        <Link href="/sign-up" className="inline-block px-10 py-4 rounded-full text-lg font-medium worship-btn-primary shadow-xl">
          Start Planning Today
        </Link>
      </section>
      
      {/* Footer */}
      <footer className="py-8 px-8 flex flex-col md:flex-row items-center justify-between text-sm" style={{ backgroundColor: 'var(--worship-white)', color: 'var(--worship-muted-slate)', borderTop: '1px solid var(--worship-border)' }}>
        <div className="flex items-center gap-2 mb-4 md:mb-0">
          <Flame className="w-4 h-4" style={{ color: 'var(--worship-gold)' }} />
          <span>© 2024 WorshipFlow. Built for the Church.</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:underline cursor-pointer">Privacy</span>
          <span className="hover:underline cursor-pointer">Terms</span>
          <span className="hover:underline cursor-pointer">Contact</span>
        </div>
      </footer>
    </div>
  );
}
