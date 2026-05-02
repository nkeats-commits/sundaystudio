import { AppLayout } from '../components/layout/AppLayout';
import { useGetMe, useUpdateChurchProfile, getGetMeQueryKey } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

const schema = z.object({
  churchName: z.string().min(1, "Church name is required"),
  denomination: z.string().optional(),
  theology: z.string().optional(),
  location: z.string().optional(),
  averageAttendance: z.coerce.number().optional().nullable(),
  musicStyle: z.string().optional(),
  traditions: z.string().optional(),
  leaderName: z.string().min(1, "Leader name is required"),
  leaderRole: z.string().optional()
});

type FormData = z.infer<typeof schema>;

export default function ChurchProfile() {
  const { data: me } = useGetMe();
  const updateProfile = useUpdateChurchProfile();
  const queryClient = useQueryClient();
  const initRef = useRef(false);
  const [, setLocation] = useLocation();

  // Allow other pages to deep-link here with ?next=<path> so we can bounce
  // the user back after they save their profile (e.g. from a generator that
  // was gated until the profile was filled).
  const nextPath = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (!next) return null;
      // Only honor in-app paths; never an absolute URL.
      if (!next.startsWith('/') || next.startsWith('//')) return null;
      return next;
    } catch {
      return null;
    }
  })();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      churchName: '',
      denomination: '',
      theology: '',
      location: '',
      averageAttendance: null,
      musicStyle: '',
      traditions: '',
      leaderName: '',
      leaderRole: ''
    }
  });

  useEffect(() => {
    if (me?.profile && !initRef.current) {
      initRef.current = true;
      reset(me.profile);
    }
  }, [me, reset]);

  const onSubmit = (data: FormData) => {
    updateProfile.mutate({ data }, {
      onSuccess: () => {
        toast.success("Church profile updated", {
          description: "Your AI generations will now use this context."
        });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        if (nextPath) {
          setLocation(nextPath);
        }
      },
      onError: () => {
        toast.error("Failed to update profile");
      }
    });
  };

  return (
    <AppLayout title="Church Profile">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <div className="pb-6 border-b border-[var(--worship-border)]">
          <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">Church Context</h1>
          <p className="text-sm text-[var(--worship-slate)]">
            Tell WorshipFlow about your church. We use this context to ensure AI-generated liturgy, songs, and services align with your theology and traditions.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="worship-card space-y-8">
          
          <div className="space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b pb-2">The Basics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">CHURCH NAME *</label>
                <input {...register("churchName")} className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
                {errors.churchName && <span className="text-xs text-red-500 mt-1">{errors.churchName.message}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">LOCATION</label>
                <input {...register("location")} placeholder="e.g. Austin, TX" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">DENOMINATION / NETWORK</label>
                <input {...register("denomination")} placeholder="e.g. Non-denominational, ACNA" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">AVG ATTENDANCE</label>
                <input type="number" {...register("averageAttendance")} placeholder="e.g. 250" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b pb-2">Your Role</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">YOUR NAME *</label>
                <input {...register("leaderName")} className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
                {errors.leaderName && <span className="text-xs text-red-500 mt-1">{errors.leaderName.message}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">YOUR ROLE</label>
                <input {...register("leaderRole")} placeholder="e.g. Worship Pastor, Lead Pastor" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b pb-2">Theology & Tradition</h2>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEOLOGICAL BENT</label>
              <textarea {...register("theology")} placeholder="e.g. Reformed, Charismatic leaning, Liturgical but casual. Describe your church's theological center of gravity." className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">MUSIC STYLE</label>
              <input {...register("musicStyle")} placeholder="e.g. Modern Worship (Hillsong/Bethel), Traditional Hymns, Blended" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TRADITIONS & RHYTHMS</label>
              <textarea {...register("traditions")} placeholder="e.g. We take communion every week. We always end with a benediction. We don't do formal scripture readings." className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none" />
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmitting || updateProfile.isPending}
              className="worship-btn-primary px-6 py-2.5 rounded-xl font-medium disabled:opacity-50"
            >
              {isSubmitting || updateProfile.isPending ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

      </div>
    </AppLayout>
  );
}
