import { AppLayout } from '../components/layout/AppLayout';
import {
  useGetMe,
  useUpdateChurchProfile,
  useListManuscripts,
  useCreateManuscript,
  useDeleteManuscript,
  useAnalyzeManuscripts,
  getGetMeQueryKey,
  getListManuscriptsQueryKey,
} from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { Upload, Trash2, FileText, Loader2, Sparkles, Plus, X, ArrowDown } from 'lucide-react';
import { useAuth } from '@clerk/react';

const PRESET_FOCUS_AREAS = [
  'Discipleship',
  'Evangelism',
  'Community Outreach',
  'Missions',
  'Youth & Young Adults',
  'Healing & Prayer',
  'Racial Reconciliation',
  'Small Groups',
  'Worship',
  'Social Justice',
  'Church Planting',
  'Family Ministry',
];

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const ACCEPTED_EXT = '.pdf,.docx,.txt';

const schema = z.object({
  churchName: z.string().min(1, 'Church name is required'),
  denomination: z.string().optional(),
  theology: z.string().optional(),
  location: z.string().optional(),
  averageAttendance: z.preprocess(
    (value) => (value === '' ? null : value),
    z.coerce.number().optional().nullable(),
  ),
  musicStyle: z.string().optional(),
  traditions: z.string().optional(),
  leaderName: z.string().min(1, 'Leader name is required'),
  leaderRole: z.string().optional(),
  toneDescription: z.string().optional(),
  missionStatement: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof schema>;

export default function ChurchProfile() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const meQuery = useGetMe({
    query: {
      enabled: authLoaded && !!isSignedIn,
      queryKey: getGetMeQueryKey(),
    },
  });
  const { data: me } = meQuery;
  const updateProfile = useUpdateChurchProfile();
  const queryClient = useQueryClient();
  const initializedUserIdRef = useRef<string | null>(null);
  const acceptedProfileUpdatedAtRef = useRef<number>(0);
  const [, setLocation] = useLocation();

  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [customFocusInput, setCustomFocusInput] = useState('');

  const { data: manuscripts = [] } = useListManuscripts();
  const createManuscript = useCreateManuscript();
  const deleteManuscript = useDeleteManuscript();
  const analyzeManuscripts = useAnalyzeManuscripts();

  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const nextPath = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (!next) return null;
      if (!next.startsWith('/') || next.startsWith('//')) return null;
      return next;
    } catch {
      return null;
    }
  })();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormData>({
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
      leaderRole: '',
      toneDescription: '',
      missionStatement: '',
      focusAreas: [],
    },
  });

  useEffect(() => {
    if (!me) return;

    const userChanged = initializedUserIdRef.current !== me.userId;
    const incomingUpdatedAt = me.profile?.updatedAt
      ? Date.parse(me.profile.updatedAt)
      : 0;
    const incomingIsNewer =
      incomingUpdatedAt >= acceptedProfileUpdatedAtRef.current;

    if (userChanged || (!isDirty && incomingIsNewer)) {
      initializedUserIdRef.current = me.userId;
      acceptedProfileUpdatedAtRef.current = incomingUpdatedAt;
      reset({
        churchName: me.profile?.churchName ?? '',
        denomination: me.profile?.denomination ?? '',
        theology: me.profile?.theology ?? '',
        location: me.profile?.location ?? '',
        averageAttendance: me.profile?.averageAttendance ?? null,
        musicStyle: me.profile?.musicStyle ?? '',
        traditions: me.profile?.traditions ?? '',
        leaderName: me.profile?.leaderName ?? '',
        leaderRole: me.profile?.leaderRole ?? '',
        toneDescription: me.profile?.toneDescription ?? '',
        missionStatement: me.profile?.missionStatement ?? '',
        focusAreas: me.profile?.focusAreas ?? [],
      });
      setFocusAreas(me.profile?.focusAreas ?? []);
    }
  }, [isDirty, me, reset]);

  const onSubmit = async (data: FormData) => {
    const submittedValues = getValues();
    const submittedFocusAreas = [...focusAreas];
    try {
      const savedProfile = await updateProfile.mutateAsync({
        data: { ...data, focusAreas: submittedFocusAreas },
      });
      await queryClient.cancelQueries({ queryKey: getGetMeQueryKey() });
      acceptedProfileUpdatedAtRef.current = Date.parse(savedProfile.updatedAt);
      queryClient.setQueryData(
        getGetMeQueryKey(),
        (current: typeof me) =>
          current
            ? {
                ...current,
                profile: savedProfile,
                onboardingCompletedAt:
                  current.onboardingCompletedAt ??
                  (savedProfile.churchName.trim() &&
                  savedProfile.leaderName.trim()
                    ? new Date().toISOString()
                    : null),
              }
            : current,
      );

      const valuesUnchanged =
        JSON.stringify(getValues()) === JSON.stringify(submittedValues);
      const focusUnchanged =
        JSON.stringify(focusAreas) === JSON.stringify(submittedFocusAreas);
      if (valuesUnchanged && focusUnchanged) {
        reset({
          churchName: savedProfile.churchName,
          denomination: savedProfile.denomination,
          theology: savedProfile.theology,
          location: savedProfile.location,
          averageAttendance: savedProfile.averageAttendance ?? null,
          musicStyle: savedProfile.musicStyle,
          traditions: savedProfile.traditions,
          leaderName: savedProfile.leaderName,
          leaderRole: savedProfile.leaderRole,
          toneDescription: savedProfile.toneDescription,
          missionStatement: savedProfile.missionStatement,
          focusAreas: savedProfile.focusAreas,
        });
        setFocusAreas(savedProfile.focusAreas);
      }

      toast.success('Your profile updated', {
        description: 'Your Sunday Studio results will now use this context.',
      });
      if (nextPath) setLocation(nextPath);
    } catch {
      toast.error('Failed to update profile', {
        description: 'Your changes are still here. Please try saving again.',
      });
    }
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  };

  const addCustomFocus = () => {
    const trimmed = customFocusInput.trim();
    if (trimmed && !focusAreas.includes(trimmed)) {
      setFocusAreas((prev) => [...prev, trimmed]);
    }
    setCustomFocusInput('');
  };

  const removeCustomFocus = (area: string) => {
    setFocusAreas((prev) => prev.filter((a) => a !== area));
  };

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) =>
        ACCEPTED_TYPES.includes(f.type) ||
        f.name.endsWith('.pdf') ||
        f.name.endsWith('.docx') ||
        f.name.endsWith('.txt'),
      );
      if (fileArr.length === 0) return;
      setUploading(true);
      try {
        for (const file of fileArr) {
          const urlRes = await fetch('/api/storage/uploads/request-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
          });
          if (!urlRes.ok) throw new Error('Failed to get upload URL');
          const { uploadURL, objectPath } = (await urlRes.json()) as {
            uploadURL: string;
            objectPath: string;
          };
          const putRes = await fetch(uploadURL, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
          });
          if (!putRes.ok) throw new Error('Failed to upload file');
          await new Promise<void>((resolve, reject) =>
            createManuscript.mutate(
              { data: { fileName: file.name, storedPath: objectPath } },
              {
                onSuccess: () => resolve(),
                onError: reject,
              },
            ),
          );
        }
        queryClient.invalidateQueries({ queryKey: getListManuscriptsQueryKey() });
        toast.success(
          fileArr.length === 1
            ? '1 sermon uploaded'
            : `${fileArr.length} sermons uploaded`,
          { description: "Ready to analyze when you're done adding files." },
        );
      } catch {
        toast.error('Upload failed — please try again');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [createManuscript, queryClient],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = (id: number) => {
    deleteManuscript.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListManuscriptsQueryKey() });
        },
        onError: () => toast.error('Could not remove that file'),
      },
    );
  };

  const handleAnalyze = () => {
    setAnalyzing(true);
    analyzeManuscripts.mutate(undefined, {
      onSuccess: () => {
        setTimeout(() => {
          setAnalyzing(false);
          toast.success('Analysis complete', {
            description: 'Sunday Studio will now write in your voice.',
          });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        }, 3000);
      },
      onError: () => {
        setAnalyzing(false);
        toast.error('Analysis failed — please try again');
      },
    });
  };

  const customAreas = focusAreas.filter((a) => !PRESET_FOCUS_AREAS.includes(a));

  if (
    !authLoaded ||
    !isSignedIn ||
    meQuery.isLoading ||
    (!meQuery.isFetched && !me)
  ) {
    return (
      <AppLayout title="Your Profile">
        <div
          aria-label="Loading your saved profile"
          className="mx-auto max-w-3xl space-y-4"
        >
          <div className="h-24 animate-pulse rounded-2xl bg-[var(--worship-sand)] opacity-50" />
          <div className="h-64 animate-pulse rounded-2xl bg-[var(--worship-sand)] opacity-40" />
        </div>
      </AppLayout>
    );
  }

  if (meQuery.isError || !me) {
    return (
      <AppLayout title="Your Profile">
        <div
          role="alert"
          className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"
        >
          <h1 className="font-serif text-xl">We couldn&apos;t load your saved profile.</h1>
          <p className="mt-2 text-sm">
            Nothing can be saved until the current profile loads, so your existing
            information is protected.
          </p>
          <button
            type="button"
            onClick={() => void meQuery.refetch()}
            className="worship-btn-outline mt-4 rounded-lg px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Your Profile">
      <div className="max-w-3xl mx-auto space-y-6">

        <div className="pb-6 border-b border-[var(--worship-border)]">
          <h1 className="text-2xl font-serif text-[var(--worship-navy)] mb-1">Your Profile</h1>
          <p className="text-sm text-[var(--worship-slate)]">
            Tell Sunday Studio about yourself and your church. The more context you share, the more
            your Sunday Studio results will feel like they were made just for you.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── The Basics ── */}
          <div className="worship-card space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b border-[var(--worship-border)] pb-2">The Basics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">CHURCH NAME *</label>
                <input {...register('churchName')} className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
                {errors.churchName && <span className="text-xs text-red-500 mt-1">{errors.churchName.message}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">LOCATION</label>
                <input {...register('location')} placeholder="e.g. Austin, TX" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">DENOMINATION / NETWORK</label>
                <input {...register('denomination')} placeholder="e.g. Non-denominational, ACNA" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">AVG ATTENDANCE</label>
                <input type="number" {...register('averageAttendance')} placeholder="e.g. 250" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
            </div>
          </div>

          {/* ── Your Role ── */}
          <div className="worship-card space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b border-[var(--worship-border)] pb-2">Your Role</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">YOUR NAME *</label>
                <input {...register('leaderName')} className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
                {errors.leaderName && <span className="text-xs text-red-500 mt-1">{errors.leaderName.message}</span>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">YOUR ROLE</label>
                <input {...register('leaderRole')} placeholder="e.g. Worship Pastor, Lead Pastor" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
              </div>
            </div>
          </div>

          {/* ── Theology & Tradition ── */}
          <div className="worship-card space-y-4">
            <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b border-[var(--worship-border)] pb-2">Theology & Tradition</h2>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">THEOLOGICAL BENT</label>
              <textarea {...register('theology')} placeholder="e.g. Reformed, Charismatic leaning, Liturgical but casual. Describe your church's theological center of gravity." className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">MUSIC STYLE</label>
              <input {...register('musicStyle')} placeholder="e.g. Modern Worship (Hillsong/Bethel), Traditional Hymns, Blended" className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">TRADITIONS & RHYTHMS</label>
              <textarea {...register('traditions')} placeholder="e.g. We take communion every week. We always end with a benediction. We don't do formal scripture readings." className="w-full h-24 px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none" />
            </div>
          </div>

          {/* ── Personalization nudge ── */}
          {(() => {
            const savedProfile = me?.profile;
            if (!savedProfile) return null;
            const basicReady =
              (savedProfile.churchName as string | null | undefined)?.trim() &&
              (savedProfile.leaderName as string | null | undefined)?.trim();
            if (!basicReady) return null;
            const hasVoice = !!(
              (savedProfile.toneDescription as string | null | undefined)?.trim() ||
              (savedProfile.derivedToneDescription as string | null | undefined)?.trim()
            );
            const hasMission = !!(savedProfile.missionStatement as string | null | undefined)?.trim();
            if (hasVoice || hasMission) return null;
            return (
              <div
                className="flex items-start gap-3 px-4 py-3.5 rounded-xl border"
                style={{ backgroundColor: 'var(--worship-pale-gold)', borderColor: 'var(--worship-gold)' }}
              >
                <ArrowDown className="w-4 h-4 shrink-0 mt-0.5 text-[var(--worship-navy)]" />
                <p className="text-sm text-[var(--worship-navy)]">
                  <span className="font-semibold">Want your Sunday Studio results to sound more like you?</span>
                  {' '}Add your preaching voice and church mission in the sections below.
                </p>
              </div>
            );
          })()}

          {/* ── Your Voice ── */}
          <div className="worship-card space-y-5">
            <div>
              <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b border-[var(--worship-border)] pb-2">Your Voice</h2>
              <p className="text-sm text-[var(--worship-slate)] mt-2">
                The more Sunday Studio understands how you communicate, the more your suggestions will sound like you.
              </p>
            </div>

            {/* Self-description */}
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">HOW WOULD YOU DESCRIBE YOUR PREACHING STYLE?</label>
              <textarea
                {...register('toneDescription')}
                rows={4}
                placeholder="Think about tone, the kind of language you use, how you tell stories, what you want people to feel, whether you lean more poetic or plain-spoken..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none"
              />
            </div>

            {/* Manuscript manager */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-0.5 text-[var(--worship-slate)]">SHARE PAST SERMONS (OPTIONAL)</label>
                <p className="text-xs text-[var(--worship-muted-slate)]">
                  The more Sunday Studio knows about your writing, the more your suggestions will sound like you. PDF, DOCX, or plain text.
                </p>
              </div>

              {/* Uploaded file list */}
              {manuscripts.length > 0 && (
                <div className="space-y-2">
                  {manuscripts.map((ms) => (
                    <div
                      key={ms.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 shrink-0 text-[var(--worship-gold)]" />
                        <span className="text-sm text-[var(--worship-navy)] truncate">{ms.fileName}</span>
                        <span className="text-xs text-[var(--worship-muted-slate)] shrink-0">
                          {new Date(ms.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(ms.id)}
                        className="ml-2 p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  dragging
                    ? 'border-[var(--worship-gold)] bg-[var(--worship-pale-gold)]/10'
                    : 'border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:bg-[var(--worship-cream)]'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--worship-gold)]" />
                    <span className="text-sm text-[var(--worship-slate)]">Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-[var(--worship-slate)]" />
                    <span className="text-sm text-[var(--worship-slate)]">
                      Drop files here, or <span className="text-[var(--worship-gold)] font-medium">browse</span>
                    </span>
                    <span className="text-xs text-[var(--worship-muted-slate)]">PDF, DOCX, or TXT — multiple files at once</span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_EXT}
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* Analyze button */}
              {manuscripts.length > 0 && (
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing || uploading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--worship-border)] bg-white text-sm font-medium text-[var(--worship-navy)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing your writing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analyze my writing style
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* ── Your Church's Mission ── */}
          <div className="worship-card space-y-5">
            <div>
              <h2 className="text-lg font-serif text-[var(--worship-navy)] border-b border-[var(--worship-border)] pb-2">Your Church's Mission</h2>
              <p className="text-sm text-[var(--worship-slate)] mt-2">
                What your church exists to do shapes everything Sunday Studio generates. A discipleship-focused church should get discipleship-shaped content.
              </p>
            </div>

            {/* Mission statement */}
            <div>
              <label className="block text-xs font-semibold mb-1 text-[var(--worship-slate)]">MISSION STATEMENT</label>
              <textarea
                {...register('missionStatement')}
                rows={3}
                placeholder="e.g. To know Christ and make Him known among the nations, starting in our neighborhood."
                className="w-full px-3 py-2 rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)] resize-none"
              />
            </div>

            {/* Focus area tags */}
            <div>
              <label className="block text-xs font-semibold mb-2 text-[var(--worship-slate)]">MINISTRY FOCUS AREAS</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_FOCUS_AREAS.map((area) => {
                  const active = focusAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleFocusArea(area)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        active
                          ? 'bg-[var(--worship-navy)] text-white border-[var(--worship-navy)]'
                          : 'bg-white text-[var(--worship-slate)] border-[var(--worship-border)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)]'
                      }`}
                    >
                      {area}
                    </button>
                  );
                })}

                {/* Custom tags */}
                {customAreas.map((area) => (
                  <span
                    key={area}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--worship-gold)] text-white border border-[var(--worship-gold)]"
                  >
                    {area}
                    <button
                      type="button"
                      onClick={() => removeCustomFocus(area)}
                      className="ml-0.5 hover:opacity-70 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add custom */}
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  value={customFocusInput}
                  onChange={(e) => setCustomFocusInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCustomFocus(); }
                  }}
                  placeholder="Add your own…"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--worship-border)] bg-[var(--worship-cream)] focus:outline-none focus:ring-2 ring-[var(--worship-gold)]"
                />
                <button
                  type="button"
                  onClick={addCustomFocus}
                  disabled={!customFocusInput.trim()}
                  className="p-2 rounded-lg border border-[var(--worship-border)] bg-white text-[var(--worship-navy)] hover:border-[var(--worship-gold)] hover:text-[var(--worship-gold)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pb-8">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                updateProfile.isPending ||
                !meQuery.isSuccess
              }
              className="worship-btn-primary px-6 py-2.5 rounded-xl font-medium disabled:opacity-50"
            >
              {isSubmitting || updateProfile.isPending ? 'Saving…' : 'Save Profile'}
            </button>
          </div>

        </form>
      </div>
    </AppLayout>
  );
}
