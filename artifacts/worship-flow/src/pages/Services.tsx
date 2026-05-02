import { AppLayout } from '../components/layout/AppLayout';
import { BookOpen, FileText, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useListServicePlans } from '@workspace/api-client-react';

export default function Services() {
  const [, setLocation] = useLocation();
  const { data: services, isLoading } = useListServicePlans();

  return (
    <AppLayout title="Saved Services">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center pb-6 border-b border-[var(--worship-border)]">
          <div>
            <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">Service Plans</h1>
            <p className="text-sm text-[var(--worship-slate)]">All your saved worship services.</p>
          </div>
          <Link href="/service-builder" className="worship-btn-primary px-5 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            Build New Service
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C99A3D]"></div>
          </div>
        ) : !services?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-[var(--worship-cream)] flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-[var(--worship-gold)]" />
            </div>
            <h3 className="text-xl font-serif text-[var(--worship-navy)] mb-2">No services yet</h3>
            <p className="text-[var(--worship-slate)] mb-6 max-w-sm">
              Your saved service plans will appear here. Start building your first service to see how WorshipFlow can help you lead.
            </p>
            <Link href="/service-builder" className="worship-btn-outline px-6 py-2.5 rounded-xl font-medium">
              Build your first service
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {services.map((service) => (
              <div 
                key={service.id} 
                onClick={() => setLocation(`/services/${service.id}`)}
                className="worship-card cursor-pointer group hover:border-[var(--worship-gold)] transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--worship-cream)] group-hover:bg-[var(--worship-pale-gold)] transition-colors">
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
      </div>
    </AppLayout>
  );
}
