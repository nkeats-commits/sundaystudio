/**
 * Seeds the help_articles table with 24 published articles covering every
 * major feature of Sunday Studio.
 *
 * Run: pnpm --filter @workspace/scripts run seed-help
 *
 * Safe to run multiple times — slugs that already exist are skipped
 * (INSERT ... ON CONFLICT DO NOTHING).
 */
import pg from "pg";

const { Client } = pg;

interface Article {
  slug: string;
  title: string;
  category: string;
  body: string;
}

const ARTICLES: Article[] = [
  // ── Getting Started ──────────────────────────────────────────────────────────
  {
    slug: "welcome-to-sunday-studio",
    title: "Welcome to Sunday Studio",
    category: "Getting Started",
    body: `Sunday Studio is an AI-powered planning companion built for pastors and worship leaders who want to prepare richer services in less time. Whether you're crafting a full Sunday order of worship, writing a sermon from scratch, or searching for songs that resonate with your text, Sunday Studio puts thoughtful, theologically grounded assistance right inside your workflow.

## What you can do here

**Plan complete services.** The Service Builder takes your Scripture passage or theme and generates a full order of worship — songs, liturgical moments, a sermon title, and transitions — shaped around your church's voice and calendar.

**Build sermons with structure.** The Sermon Builder is a three-panel workspace that walks you through Study, Big Idea, Outline, Manuscript, Applications, Illustrations, and Worship Integration — each section generated on demand so you stay in control of the pace.

**Generate individual elements.** Need a call to worship for Wednesday night? A speaking moment for the offering? A devotional for your staff meeting? The single-purpose generators in the sidebar handle these in seconds.

**Save and organise everything.** Every AI output you keep lands in your Library, searchable and reusable for future planning.

## Finding your way around

The sidebar on the left is your primary navigation. At the top you'll find your most-used destinations: Dashboard, Service Builder, Sermon Builder, and the Generator tools. Toward the bottom are the Library, Resources, and your Church Profile. The gear icon takes you to Settings.

The **Dashboard** is your home base — a quick look at recent services and shortcuts to your most common tasks.

## A good first step

Before generating anything, visit your **Church Profile** (the church icon in the sidebar). Filling in your denomination, congregation size, worship style, and pastor's name takes about five minutes and makes every AI output significantly more relevant to your community. The AI reads your profile before generating anything, so this small investment pays off in every session.

If you have any questions, browse the other articles in this Help Center or reach out through the Settings page.`,
  },
  {
    slug: "setting-up-your-church-profile",
    title: "Setting Up Your Church Profile",
    category: "Getting Started",
    body: `Your Church Profile is the foundation of everything Sunday Studio generates. Before the AI writes a single word, it reads your profile so that every song suggestion, sermon outline, and liturgical element is shaped by your church's identity rather than a generic template.

## How to find it

Click the **church building icon** in the sidebar, or navigate to /church directly. The page opens a simple form you can update any time.

## What to fill in

**Church name and location.** These appear in generated content when it references your congregation by name.

**Denomination or tradition.** This shapes theological language, liturgical assumptions, and the kinds of illustrations the AI reaches for. A Reformed Baptist church and a charismatic Pentecostal church should sound quite different — and with your denomination filled in, they will.

**Congregation size.** Small, medium, and large congregations have different cultures and needs. This helps the AI pitch its suggestions appropriately.

**Worship style.** Contemporary, traditional, blended, liturgical — your style influences song choices, the formality of language in liturgy, and how the AI frames spoken transitions.

**Pastor's name.** When the AI drafts a speaking moment or sermon opener, it can address your congregation as if you're speaking rather than in generic third-person voice.

**Additional context.** There's a free-text field for anything else that matters — your church's values statement, a recurring series theme, notes about your worship team's size or instrumentation, or the season of the church calendar you're in. This field is read verbatim, so the more specific you are, the more tailored the output.

## Why it matters

Every generation request — service plans, song lists, sermon content, liturgy — is preceded by a church context block that the AI uses to personalise its output. Leaving the profile blank means you'll receive well-written but generic content. Filling it in means you'll receive content that sounds like it came from someone who knows your church.

## Keeping it current

Update your profile when your context changes: a new sermon series, a different liturgical season, a change in pastoral staff, or a seasonal emphasis like Advent or Lent. You can update it as often as you like — changes take effect immediately for all subsequent generations.`,
  },
  {
    slug: "your-dashboard",
    title: "Your Dashboard",
    category: "Getting Started",
    body: `The Dashboard is the first thing you see after signing in, and it's designed to get you back into your work quickly — without scrolling through lists or hunting for what you were doing last week.

## What's on the Dashboard

**Recent service plans.** Your most recently saved services appear here with their title, date, and a quick link to open them. This makes it easy to pick up a plan you started earlier in the week or review something from last Sunday.

**Quick-action buttons.** Prominent shortcuts let you jump straight to the Service Builder, Sermon Builder, or any of the generators without navigating through the sidebar.

**At-a-glance context.** The Dashboard reflects your actual activity rather than static links, so it becomes more useful the more you use Sunday Studio.

## Using the Dashboard as a launchpad

Many pastors find it helpful to open Sunday Studio on Monday or Tuesday and use the Dashboard to orient the week's planning. A typical flow might look like this:

1. **Open a sermon** you started last week and continue from where you left off.
2. **Start a new service plan** from the Service Builder shortcut.
3. **Browse the Library** for a devotional you saved last month that might fit this week's theme.

## Navigating from here

The sidebar is always available. If the Dashboard doesn't show a shortcut you need, look to the left — the full navigation is one click away. The bottom of the sidebar holds links to your Library, Resources, Help Center, and Settings.

## A note on loading

The Dashboard pulls live data each time you open it, so it always reflects your most recent saves. If you just created a new service plan, give it a moment to appear — a quick refresh will show it.

## Making it a habit

The most effective way to use the Dashboard is as a weekly ritual. Open Sunday Studio at the same time each week — Monday morning after the weekend, or Tuesday once the dust has settled — and let the Dashboard orient your planning session. See what's already saved, identify what still needs to be done, and use the quick links to move straight into the work. Over time, this rhythm transforms scattered planning into a calm, consistent process.`,
  },
  {
    slug: "understanding-the-ai",
    title: "How the AI Works",
    category: "Getting Started",
    body: `Sunday Studio uses AI to generate draft content — sermons, service plans, songs, liturgy, and more. This article explains how that works in plain terms so you know what to expect and how to get the best results.

## It reads your context first

Before generating anything, the AI reads your **Church Profile**. Your denomination, worship style, congregation size, pastor's name, and any additional notes are sent alongside every request. This is why filling in your profile makes such a meaningful difference — the AI isn't guessing about your church, it's working from what you've told it.

## It generates drafts, not final products

Everything the AI produces is a starting point, not a finished product. A sermon outline might nail your theological arc but suggest an illustration that doesn't quite fit your congregation — that's your cue to swap it. A song suggestion might be exactly right or slightly off-tempo for your set — you decide. Think of the AI as a well-read, fast-working associate who brings you strong first drafts.

## It doesn't fabricate sources

Sunday Studio is designed with scholarly integrity in mind. The Sermon Builder is instructed never to fabricate commentary quotes or attribute opinions to scholars unless it has a verified source. If you've attached resources from the Resource Library, the AI can reference them. If scholarly sources are enabled in Settings, the AI consults public-domain commentaries. In every case, it's honest about the limits of what it knows.

## It improves with specificity

The more context you give, the better the output. A Service Builder request with a Scripture passage, a theme sentence, and a note about the season you're in will produce a much richer plan than a bare keyword. Similarly, the Sermon Builder produces stronger content when the context sidebar has your passage, series title, and any initial thoughts.

## It doesn't remember between sessions

The AI doesn't carry memory from one session to the next on its own. Your Church Profile is the persistent memory it has access to — which is another reason to keep it current and detailed.

## You are always in control

The AI never saves anything without your action. Generated content sits on screen until you explicitly save it to your Library or a service plan. You can regenerate, ignore, or edit anything it produces.`,
  },

  // ── Service Planning ──────────────────────────────────────────────────────────
  {
    slug: "building-a-service-plan",
    title: "Building a Service Plan",
    category: "Service Planning",
    body: `The Service Builder generates a complete order of worship from a Scripture passage or theme — songs, liturgical elements, a sermon title, and spoken transitions — all shaped around your church's voice.

## Getting started

Navigate to **Service Builder** in the sidebar. You'll see a form where you can enter:

- **Scripture passage** — the primary text for the service (e.g. "John 15:1-17" or "Romans 8:28-39")
- **Theme or title** — a brief phrase capturing the heart of the message
- **Any additional notes** — seasonal context, a special occasion, or a note about your worship team

The more context you give, the more tailored the result. Even a one-line note like "Advent, second Sunday, theme of hope" meaningfully shapes the output.

## Reading the generated plan

Once the AI generates your plan, you'll see a structured order of worship with named slots: Gathering Song, Call to Worship, Worship Set, Scripture Reading, Sermon, Offering, Response Song, and so on. Each slot includes a title or song suggestion and a brief body note.

Take a moment to read through the whole plan before making changes. The AI builds it as a coherent arc — the song choices, the liturgical language, and the spoken transitions are designed to work together.

## Adjusting the plan

You can edit any slot's title or body text directly. If a song suggestion doesn't fit your repertoire, simply type in a different song. If the call to worship feels too formal for your congregation, rewrite it in your own voice.

Slots can also be replaced with saved sermons or library items using the Slot Picker (the link icon on any supported slot). See the *Swapping Slots with Saved Content* article for details.

## Saving the plan

When you're satisfied, click **Save**. The plan is stored under **Services** in the sidebar and can be opened, edited, printed, or shared at any time.

## Tips for best results

- Run the Service Builder **early in the week** so you have time to review and adjust.
- Fill in your Church Profile before running your first generation — it makes the output immediately more relevant.
- If the first result doesn't feel quite right, try adding a note in the context field and generate again.`,
  },
  {
    slug: "editing-a-saved-service",
    title: "Editing a Saved Service",
    category: "Service Planning",
    body: `Once a service plan is saved, it lives in **Services** in the sidebar and can be opened and edited any time before Sunday.

## Opening a saved plan

Click **Services** in the sidebar to see a list of all your plans. Each entry shows the plan title and the date it was saved. Click any plan to open it in the Service Detail view.

## Editing slot content

Every slot in the plan has an editable title and body text. Click into either field to make changes. Edits are saved when you click the **Save** button or navigate away — so make sure to save before closing the tab.

You can also:

- **Rename the slot** — useful when the AI gave it a generic label and you want something more specific to your service.
- **Rewrite the body text** — the AI's suggestion is a starting point; feel free to replace it with your own language.

## Replacing a slot with saved content

Certain slot types — songs, sermons, liturgical elements — support linking to a saved item. Look for the link icon on a slot to open the **Slot Picker**, which lets you browse your Library and Sermon Archive and swap the slot for a saved item. See *Swapping Slots with Saved Content* for details.

## Reordering slots

Drag slots to reorder them. The order you set here is the order that appears in the print view.

## Printing or exporting

When the plan is ready, click the **Print** button (or the printer icon) to open a clean print view. This view is formatted for bulletins — titles are prominent, body text is legible, and navigation chrome is hidden. Use your browser's print dialog to print or save as PDF.

## Deleting a plan

At the bottom of the Service Detail view there is a **Delete** option. Deleting a plan is permanent, so take a moment to confirm before proceeding. Linked sermon or library items are not affected — only the service plan itself is removed.`,
  },
  {
    slug: "linking-sermons-to-services",
    title: "Linking Sermons to Service Plans",
    category: "Service Planning",
    body: `Sunday Studio connects your sermon preparation to your service planning through a feature called **Build Service from Sermon**. Instead of starting your order of worship from scratch, you can let the Sermon Builder's Worship Integration output seed the full plan.

## How it works

When you finish the **Worship Integration** tab in the Sermon Builder, the AI suggests songs, a call to worship, a response, and transitional moments — all tied directly to your sermon's Big Idea. At that point, a **Build Service from Sermon** button appears.

Clicking it does three things:

1. **Composes a full service plan** from the Worship Integration content, including all the suggested songs and liturgical moments.
2. **Creates a sermon slot** in the plan and links it back to your saved sermon.
3. **Saves the plan** to your Services list, where you can open, edit, and print it.

## The linked pill

On any service plan, a slot that is linked to a sermon or library item shows a small **bronze pill** next to its title. This is a visual reminder that the slot's content comes from a specific saved item. Hovering the pill shows the linked item's title.

Linked slots retain a snapshot of the content at the time of linking — so if you later edit the sermon, the service plan keeps its original version. You can re-link at any time to pull in updated content.

## Reverse lookup

If you want to see which service plans reference a particular sermon, open the sermon in the Sermon Builder and look for the **Linked Services** section. Similarly, from the Library, a linked item shows which plans have pulled it in. This helps you track where content is being reused across multiple services.

## When to use this feature

**Build Service from Sermon** is most useful when the sermon is the anchor of your planning — which it usually is. Write the sermon first, work through the Worship Integration tab, then let the AI compose the service around it. The result is a plan where every element is theologically connected to the Word you're preaching.`,
  },
  {
    slug: "slot-picker",
    title: "Swapping Slots with Saved Content",
    category: "Service Planning",
    body: `The Slot Picker lets you replace any compatible slot in a service plan with a saved sermon or library item. This is useful when you've already prepared content elsewhere and want to pull it directly into the service.

## Opening the Slot Picker

In the Service Detail view, slots that support linking show a **link icon** (a small chain-link button) next to the title. Clicking it opens the Slot Picker modal.

## What you can link

Not every slot type supports linking — slots like Offering or Announcements are generic enough that they rarely point to a specific saved item. Supported slot types include:

- **Sermon** — links to a saved sermon from your Sermon Archive
- **Song** — links to a saved song from your Library
- **Liturgy** — links to a saved call to worship, responsive reading, or other liturgical item
- **Speaking moment** — links to a saved speaking moment or transition

The link icon is only shown on slots where linking makes sense.

## Browsing and selecting

The Slot Picker shows your Library and Sermon Archive, filtered to the relevant kind for each slot. You can search by title and click any result to select it.

Once selected, the slot's title updates to match the linked item, and a **bronze pill** appears next to the title as a visual indicator. The slot body is also updated with a snapshot of the linked item's content.

## Unlinking a slot

Click the bronze pill on a linked slot to unlink it. The slot reverts to its previous title and body, and the link indicator disappears. You can then edit the slot manually or open the Slot Picker again to choose a different item.

## Content snapshots

Linking creates a snapshot — the slot stores the title and body from the linked item at the moment of linking. If you later edit the original sermon or library item, the service plan keeps its snapshot. Re-open the Slot Picker and re-link to pull in the updated content.`,
  },
  {
    slug: "printing-a-service",
    title: "Printing or Sharing a Service Plan",
    category: "Service Planning",
    body: `Sunday Studio includes a print view for your service plans that produces clean, bulletin-ready output you can print or save as a PDF.

## Opening the print view

From the Service Detail page, click the **Print** button or printer icon in the header. This opens a separate print-optimised view of the plan in a new browser tab.

## What the print view includes

The print view shows:

- The service plan title
- Each slot's label and title (e.g. "Opening Song — Great Is Thy Faithfulness")
- Body text for each slot, formatted for readability
- The date the plan was saved

Navigation elements, editing controls, and the sidebar are hidden in the print view so nothing extraneous appears on the printed page.

## Printing to paper

Use your browser's print dialog (Ctrl/Cmd + P) to send the page to your printer. Most printers will render the page cleanly in black and white. If you find the layout cramped, try setting the paper size to Letter and the margins to Narrow in the print dialog.

## Saving as PDF

In the browser print dialog, choose **Save as PDF** (or your system's equivalent) as the destination instead of a physical printer. This creates a PDF you can save, share via email, or send to a team member who needs to see the order of worship.

## Sharing with your team

Once you have a PDF, you can share it by email or through any messaging platform your team uses. If your team uses a church management or planning tool, the PDF can be uploaded there as well.

## Tips

- Review the service plan completely before printing — it's easier to change a slot title before printing than after.
- If you'd like the plan to include your church's name or logo, add those details to the plan title or the top slot's body text before printing.`,
  },

  // ── Sermon Builder ──────────────────────────────────────────────────────────
  {
    slug: "sermon-builder-overview",
    title: "Sermon Builder Overview",
    category: "Sermon Builder",
    body: `The Sermon Builder is Sunday Studio's most comprehensive tool — a three-panel workspace that walks you from initial study all the way through a complete sermon manuscript and worship integration plan.

## The three-panel layout

**Left panel: Context sidebar.** This is where you set up the sermon before generating anything. Enter your Scripture passage, series title, any thematic notes, and the week's date. You can also attach resources from your Resource Library here. The AI reads everything in this panel before generating each tab.

**Centre: Tab rail.** Seven tabs run across the top of the centre panel:

- **Study** — key themes, cross-references, cultural and historical background
- **Big Idea** — a single-sentence central proposition
- **Outline** — a structured sermon outline built from the Big Idea
- **Manuscript** — a full preaching draft
- **Applications** — practical takeaways for your congregation
- **Illustrations** — story-based illustrations tied to the sermon's themes
- **Worship Integration** — song and liturgy suggestions connected to the Big Idea

**Right panel: Output area.** Generated content appears here. You can read, edit, copy, and regenerate each tab independently.

## Starting a new sermon

Click **New Sermon** in the Sermon Builder or navigate to /sermons/new. Fill in at least the Scripture passage and a working title in the context sidebar. Then click **Generate** on the Study tab to begin.

## Working through the tabs

The tabs are designed to build on each other. A typical flow:

1. Generate **Study** to ground yourself in the text.
2. Use the **Big Idea** tab to crystallise the central message.
3. Build the **Outline** from the Big Idea.
4. Draft the **Manuscript** once the outline feels right.
5. Generate **Applications** and **Illustrations** to complete the sermon.
6. Finish with **Worship Integration** to connect the sermon to the service.

You're never locked into this order — generate any tab at any time. But starting with Study and Big Idea usually produces the strongest downstream results.

## Saving your work

Sermons are saved automatically each time you generate a tab. You can also save manually at any time. All your sermons appear in the **Sermon Archive** under the Sermons menu in the sidebar.`,
  },
  {
    slug: "sermon-study-tab",
    title: "The Study Tab",
    category: "Sermon Builder",
    body: `The Study tab is the recommended starting point in the Sermon Builder. It grounds your preparation in the biblical text before any other generation takes place.

## What the Study tab generates

When you click **Generate** on the Study tab, the AI reads your Scripture passage (and any context notes in the sidebar) and produces a structured study document that includes:

- **Key themes** — the dominant theological ideas at work in the passage
- **Cross-references** — related Scripture passages that illuminate the text
- **Historical and cultural background** — context about the world in which the passage was written
- **Linguistic notes** — observations on key terms, their meaning, and their significance
- **Interpretive questions** — open questions worth sitting with as you develop the sermon

## Why start here

Generating Study first gives every subsequent tab a richer foundation. When the AI produces a Big Idea or an Outline, it draws on the themes and cross-references surfaced in the Study output. Starting with Study — rather than jumping straight to Outline or Manuscript — typically produces more theologically coherent downstream content.

## Using scholarly sources

If you have scholarly sources enabled in **Settings**, the AI silently consults bundled public-domain commentaries (like Matthew Henry) before generating the Study output. These are not quoted verbatim, but they inform the background and interpretive observations. A "Sources consulted" footer at the bottom of the Study output shows which commentaries were referenced.

## Editing study notes

The Study output is fully editable. Many pastors use it as a personal study document — adding their own annotations, highlighting the cross-references they want to follow up, or deleting sections that aren't relevant. You can also regenerate at any time if you want a fresh set of observations.

## Attaching resources

If you've uploaded commentary excerpts or personal notes to your Resource Library, attach them to the sermon via the context sidebar before generating Study. The AI will incorporate those resources into its analysis, and they'll be referenced throughout the sermon if relevant.`,
  },
  {
    slug: "sermon-big-idea-and-outline",
    title: "Big Idea & Outline",
    category: "Sermon Builder",
    body: `The Big Idea and Outline tabs are the structural heart of the Sermon Builder. Together they define the single governing thought of your sermon and the framework that delivers it.

## The Big Idea tab

The Big Idea is a single declarative sentence that captures what the sermon is about and what it calls the congregation to believe, feel, or do. It's the kind of sentence Haddon Robinson called the "homiletical idea" — the one thing every part of the sermon serves.

When you click **Generate** on the Big Idea tab, the AI reads your passage, your study notes (if generated), and any context you've added in the sidebar, and proposes a Big Idea sentence.

**Editing the Big Idea.** The generated sentence is a strong starting point, but the Big Idea is ultimately yours. Edit it until it sounds like your voice and captures exactly what you want your congregation to leave with. The more specific the Big Idea, the stronger the Outline and Manuscript will be — so invest time here.

## The Outline tab

Once you have a Big Idea you're happy with, the Outline tab builds a sermon structure from it. Click **Generate** and the AI produces a multi-point outline where each movement of the sermon flows from and returns to the Big Idea.

A typical outline includes:

- An introduction that raises the need the Big Idea addresses
- Two to four main points that develop the Big Idea exegetically
- A conclusion that calls the congregation to respond

**Editing the Outline.** Outlines are editable. You can rename points, reorder them, add sub-points, or delete sections that don't serve the sermon. Many preachers find that the AI's outline is close but needs a structural adjustment or a tighter third point — this is normal and expected.

## The relationship between these tabs

A clear Big Idea makes the Outline stronger. A strong Outline makes the Manuscript richer. Spending an extra ten minutes refining the Big Idea before generating the Outline is usually the highest-leverage investment in the Sermon Builder workflow.`,
  },
  {
    slug: "sermon-manuscript",
    title: "Writing Your Manuscript",
    category: "Sermon Builder",
    body: `The Manuscript tab produces a full preaching draft — a complete, word-for-word text of the sermon based on your passage, Big Idea, and Outline.

## When to generate the Manuscript

Generate the Manuscript after you have a Big Idea and Outline you're satisfied with. The AI builds the manuscript by working through each point in your outline, so a well-structured outline produces a well-structured draft.

If you generate the Manuscript without a prior outline, the AI will construct its own internal structure. The result is still usable, but starting from an approved outline gives you more control over the sermon's shape.

## What the Manuscript includes

A generated manuscript typically includes:

- An **introduction** that hooks the congregation and raises the sermon's central question
- **Developed main points**, each with biblical exposition, illustration space, and application
- **Transitions** between points that remind the listener of the Big Idea
- A **conclusion** with a call to action or response

The AI writes in a warm, pastoral voice informed by your church profile. It does not fabricate specific illustrations or attribute quotes to scholars — those come from the Applications and Illustrations tabs, or from your attached resources.

## Streaming generation

The Manuscript is one of the longer generation tasks. The text appears progressively as the AI writes it — you'll see paragraphs appear in real time. You can read along as it's being generated and have a sense of the shape before it's complete.

## Editing your draft

The manuscript is fully editable. Most preachers use it as a first draft and revise extensively — sharpening language, adding personal illustrations, cutting sections that feel weak, and adjusting length. The AI produces solid structure and theological substance; you bring your own voice, stories, and pastoral sensitivity.

## Saving

The manuscript is saved automatically when generation completes and whenever you make edits. There is no separate "save manuscript" step — changes persist as long as you're logged in.`,
  },
  {
    slug: "sermon-applications-and-illustrations",
    title: "Applications & Illustrations",
    category: "Sermon Builder",
    body: `Two of the most practically useful tabs in the Sermon Builder are Applications and Illustrations — they give you concrete material to make the sermon land with your congregation.

## The Applications tab

Applications are the "so what?" of the sermon — specific, actionable responses the congregation can take in response to the text. Good applications are concrete enough to picture, relevant enough to matter this week, and varied enough to speak to different life situations in the room.

When you click **Generate** on the Applications tab, the AI reads your passage, Big Idea, and any context notes, and produces a list of practical applications. These are grouped by life context — relationships, work, family, faith practices — so you can choose the ones that best fit your congregation's current season.

**Using applications in the manuscript.** You can copy any application from this tab and paste it directly into the relevant point in your Manuscript. Many preachers use the Applications tab to check that every point has a clear practical dimension before the manuscript is finalised.

## The Illustrations tab

Illustrations are brief, story-based examples that make abstract theological truths concrete. The Illustrations tab generates a set of story hooks — scenarios, historical moments, or everyday situations — tied to the themes of your passage.

**Important note:** The AI generates **story hooks and scenarios**, not fully sourced stories. These are starting points that you fill in with your own research, experience, or verified sources. The AI does not fabricate specific people, dates, or quotations — if an illustration refers to a historical figure or event, treat it as a pointer for your own research, not a citable fact.

## Regenerating

Both tabs support regeneration. If the first set of applications feels generic or the illustrations don't resonate, click **Generate** again. Each generation is independent, so you can save the first run and compare it to the second.

## Saving to the Library

Individual applications and illustrations can be saved to your Library for later use across different sermons and series.`,
  },
  {
    slug: "sermon-worship-integration",
    title: "Worship Integration",
    category: "Sermon Builder",
    body: `The Worship Integration tab is where the Sermon Builder connects to your full service plan. It produces song and liturgy suggestions woven around your sermon's Big Idea, so that every part of the service speaks with one voice.

## What Worship Integration generates

When you click **Generate** on the Worship Integration tab, the AI produces:

- **Song suggestions** for each moment in the service — opener, gathering set, response, and sending — selected for their thematic connection to the Big Idea
- **A call to worship** drawn from the sermon's passage or theme
- **A sending benediction** that echoes the sermon's central call
- **Transitional notes** for spoken moments between elements

If you have a Song Repertoire set up in your Library, the AI biases its song suggestions toward songs your congregation already knows. Songs marked as outside your repertoire are still suggested if they're a strong fit, but your repertoire songs are preferred.

## Using "Build Service from Sermon"

At the bottom of the Worship Integration output, you'll find a **Build Service from Sermon** button. Clicking it:

1. Takes the song and liturgy suggestions from this tab
2. Composes a full order of worship around them
3. Creates a linked sermon slot in the service plan
4. Saves the plan directly to your Services list

This is the fastest way to move from a finished sermon to a complete service plan. The result in your Services list is a normal service plan — you can edit, reorder, and print it just like any other.

## When to generate Worship Integration

Most pastors find it most useful to generate Worship Integration after the Big Idea is solid — even before the full manuscript is complete. The Big Idea is what shapes the worship arc, so you don't need a finished sermon to build a theologically integrated service plan.`,
  },

  // ── AI Generators ──────────────────────────────────────────────────────────
  {
    slug: "song-assistant",
    title: "Song Assistant",
    category: "AI Generators",
    body: `The Song Assistant helps you find songs that fit your Scripture passage, theme, or season — drawing from a broad knowledge of contemporary worship and hymns, and optionally filtering to songs your congregation already knows.

## Getting started

Navigate to **Generators → Songs** in the sidebar. You'll see a form where you can enter:

- **Scripture passage or theme** — what the service is about (e.g. "Psalm 23" or "God's faithfulness in suffering")
- **Service moment** — where in the service the songs will be used (Opening, Response, Communion, Sending, etc.)
- **Additional notes** — tempo, mood, instrumentation, or any other guidance

## The Repertoire control

The Song Assistant has a three-state control for how it uses your Song Repertoire:

**Prefer (default).** The AI biases toward songs in your repertoire, but will also suggest songs outside it if they're a strong fit. This is the best setting when you want mostly familiar songs with occasional new ones.

**Strict.** The AI only suggests songs from your repertoire. Use this when your team needs to work exclusively from songs they already know — smaller teams, last-minute planning, or seasons when learning new material isn't practical. Strict mode is only available when you have at least one song in your repertoire.

**Off.** The AI suggests the best songs for the theme regardless of your repertoire. Use this when you're intentionally exploring new material or planning a special service.

## Reading the results

Each suggested song shows its title, artist, and a brief note explaining why it fits the theme or moment. Songs that are already in your repertoire are marked with a star indicator.

## Saving songs

Click **Save to Library** on any song to add it to your Library. From there it can be linked to a service plan slot or referenced in future planning sessions. You can also star a song from the results to add it directly to your repertoire.`,
  },
  {
    slug: "song-repertoire",
    title: "Managing Your Song Repertoire",
    category: "AI Generators",
    body: `Your Song Repertoire is a list of songs your congregation knows and sings regularly. When you build it out, the Song Assistant and Service Builder can prefer these familiar songs in their suggestions — making it easier to plan services around what your worship team already plays.

## Where to find the Repertoire

Navigate to **Library** in the sidebar and click the **Our Repertoire** tab. This shows all songs you've marked as part of your repertoire, sorted alphabetically.

## Adding songs one at a time

Use the **Add a song** form at the top of the Repertoire tab. Enter the song title and optionally the artist, then click Add. The song is immediately added to your repertoire and available to the Song Assistant.

## Pasting a bulk list

If you have an existing song list — from your church management system, a spreadsheet, or a document — use the **Paste a list** button. This opens a modal where you can paste lines of text in any of these formats:

- Title
- Title - Artist
- Title — Artist

The system parses each line, deduplicates against songs already in your repertoire (case-insensitively), and adds only the new ones. This makes it easy to import a full repertoire in one step.

## Starring songs from the Library

Any song in your Library — whether it came from the Song Assistant, the Service Builder, or was added manually — can be starred to add it to your repertoire. Click the star icon on any song card to toggle its repertoire status.

## How the Repertoire affects generation

When you use the Song Assistant with **Prefer** or **Strict** mode, the AI receives your repertoire list before generating suggestions. In **Prefer** mode, it biases toward these songs. In **Strict** mode, it only returns songs that appear in your repertoire.

The Service Builder and the Sermon Builder's Worship Integration tab always use Prefer mode automatically — they'll favour your repertoire songs without requiring any extra setup.

## Removing songs

To remove a song from your repertoire, click the star again on its Library card to unstar it. The song remains in your Library as a saved item — only its repertoire flag is cleared.`,
  },
  {
    slug: "liturgy-generator",
    title: "Liturgy Generator",
    category: "AI Generators",
    body: `The Liturgy Generator creates calls to worship, responsive readings, prayers of confession, affirmations of faith, benedictions, and other liturgical elements — tailored to your passage, season, and congregation.

## Getting started

Navigate to **Generators → Liturgy** in the sidebar. The form asks for:

- **Scripture passage or theme** — the anchor for the liturgical piece
- **Type of liturgical element** — call to worship, prayer, responsive reading, benediction, etc.
- **Tone and style** — formal or conversational, ancient or contemporary
- **Any additional notes** — seasonal context, a specific liturgical occasion, or a note about how the element will be used in the service

## What the generator produces

The output is a formatted liturgical text ready to use as written or as a starting point for your own revision. Responsive readings include clear Leader/People formatting. Prayers are structured with opening, body, and close. Calls to worship are designed to be heard aloud.

The AI writes in a voice informed by your church profile — so a traditionally liturgical church and a contemporary evangelical church will receive stylistically different outputs even for the same passage.

## Editing the output

The generated text is fully editable. Many pastors keep the structure and Scripture language but adjust phrasing to match the rhythm of their own speech, or to incorporate a particular phrase from the sermon.

## Saving to the Library

Click **Save to Library** to store the liturgical element. Saved liturgy items can be linked to service plan slots, browsed in the Library, or recalled in future seasons when the same passage or theme comes around again.

## Seasonal liturgy

The Liturgy Generator is particularly useful for seasons like Advent, Lent, Holy Week, and Easter, when congregations appreciate texts that carry the weight of the church calendar. Include the season in your context notes for output that reflects the appropriate liturgical register.`,
  },
  {
    slug: "speaking-moment-generator",
    title: "Speaking Moment Generator",
    category: "AI Generators",
    body: `The Speaking Moment Generator creates brief spoken scripts for the transitions, announcements, and pastoral addresses that hold a service together — the moments between the music and the message.

## What it's for

Every service has moments that require a few words from the pastor or worship leader: welcoming the congregation, introducing the offering, transitioning from worship into the sermon, or closing with a sending word. These moments matter more than they're often given credit for — they set the tone, reinforce the theme, and help the congregation feel at home.

The Speaking Moment Generator gives you a well-crafted first draft for any of these moments in seconds.

## Getting started

Navigate to **Generators → Speaking Moment** in the sidebar. The form asks for:

- **The type of moment** — welcome, offering intro, sermon intro, transition, closing send, or custom
- **Scripture or theme** — the thread you want the moment to connect to
- **Length** — a brief note (one or two paragraphs) or a longer address
- **Tone** — warm and conversational, celebratory, reflective, etc.

## Typical use cases

- **Welcome and greeting** — A warm, specific opening that acknowledges the congregation and sets the service's emotional tone.
- **Offering introduction** — A few sentences that give the offering theological context rather than treating it as an administrative moment.
- **Sermon intro bridge** — A transitional paragraph that lands from the final worship song and opens into the sermon.
- **Congregational instruction** — A brief explanation of a liturgical practice for visitors — taking communion, a responsive reading, or a candle-lighting moment.
- **Sending and dismissal** — A brief, energising close that sends the congregation into the week.

## Editing and using the output

The generated script is yours to use as written, edit freely, or treat as a structural prompt for something you'd rather say in your own words. Save it to the Library to reuse or adapt in future services.`,
  },
  {
    slug: "devotional-generator",
    title: "Devotional Generator",
    category: "AI Generators",
    body: `The Devotional Generator creates short, focused devotionals for staff meetings, mid-week gatherings, small group openers, personal reflection, or any context where you need a brief, grounded word.

## Getting started

Navigate to **Generators → Devotional** in the sidebar. The form asks for:

- **Scripture passage** — the text for the devotional
- **Setting or audience** — staff meeting, small group, personal devotion, prayer meeting, youth group, etc.
- **Theme or focus** — an optional clarifying note about what aspect of the passage to emphasise
- **Length** — short (a few paragraphs) or medium (a full page)

## What a devotional includes

A generated devotional typically includes:

- **An opening observation** that enters the passage from an angle relevant to the setting
- **A brief exposition** of one or two key verses
- **A reflection prompt or application** — something to sit with or act on
- **A closing prayer or benediction**

The length and formality are calibrated to the setting you specify. A devotional for a pastoral staff meeting reads differently than one for a youth group or a personal quiet time.

## Saving and reusing

Devotionals are saved to your Library when you click **Save**. From the Library, you can browse them by kind, search by keyword, or link them to a service plan's devotional slot.

Devotionals are also useful as seed material for longer sermons — if a brief devotional on a passage resonates, you can paste its insight into the Sermon Builder's context sidebar and let the AI build from there.

## A note on brevity

Devotionals are intentionally brief by design. The goal is a few minutes of focused reflection, not a full sermon. If you find the output feels too compressed for your setting, try requesting a medium-length devotional or adding a note in the context field asking for more depth on a particular point.`,
  },

  // ── Resource Library & Sources ────────────────────────────────────────────
  {
    slug: "resource-library",
    title: "Resource Library",
    category: "Resources",
    body: `The Resource Library is where you store commentary excerpts, personal notes, and outside research that the Sermon Builder's AI can read during generation. It's the bridge between your own study and the AI's output.

## What goes in the Resource Library

The Resource Library is designed for **textual sources** — not files, not links, but actual text that you want the AI to be able to read. Common uses include:

- Excerpts from commentaries you own (copied and pasted in)
- Personal exegetical notes from prior study
- Quotes from theologians or preachers you want to engage with
- Cross-referenced material from other sermons or series

## Adding a resource

Navigate to **Resources** in the sidebar. Click **Add Resource** and fill in:

- **Title** — the name of the source (e.g. "Spurgeon on Psalm 23")
- **Author** — optional, but helpful for tracking sources
- **Excerpt** — the actual text you want the AI to read

There is no strict length limit on the excerpt, but shorter, more focused excerpts tend to work better than long unstructured passages.

## Attaching resources to a sermon

Adding a resource to the library doesn't automatically make the AI read it. You need to **attach** it to a specific sermon via the Sermon Builder's context sidebar. In the sidebar, look for the **Resources** section and select the resources you want the AI to consult for this sermon.

Once attached, the AI reads the resource excerpt during each generation step and may reference it in the Study, Big Idea, Outline, or Manuscript outputs. The AI is instructed not to fabricate quotations or misattribute ideas — it uses resources to inform and ground its output, not to put words in scholars' mouths.

## Scholarly integrity

Sunday Studio's AI safety rules prevent it from generating fabricated commentary quotes. If a resource excerpt contains a quotation you want to include in the sermon, copy it manually from the resource into the manuscript — the AI will not invent quotations on your behalf.`,
  },
  {
    slug: "scholarly-sources",
    title: "Scholarly Sources",
    category: "Resources",
    body: `Sunday Studio includes a library of bundled public-domain commentaries that the Sermon Builder can consult silently when preparing sermon content. These are classic works whose copyright has expired, made available to pastors as a free scholarly layer beneath every generation.

## What's included

The initial release includes **Matthew Henry's Concise Commentary** — a complete, chapter-by-chapter commentary covering all 66 books of the Bible. Henry (1662–1714) was a Nonconformist minister whose commentary remains one of the most widely read in evangelical history. The text comes from a public-domain edition and is used here without modification.

Additional commentaries — including Jamieson-Fausset-Brown, Barnes' Notes, Keil & Delitzsch, and others — are in preparation for future releases.

## How the AI uses them

When the Sermon Builder generates the Study tab, it silently looks up commentary material for your passage from whichever sources you've enabled. This material is used to **inform** the AI's analysis — it grounds the output in established interpretation rather than the model's own reasoning alone. The commentary is not quoted verbatim in the output; it shapes the background observations and thematic emphasis.

At the bottom of the Study tab output, a **"Sources consulted"** footer shows which commentaries were referenced for your passage.

## Enabling and disabling sources

Go to **Settings** (the gear icon in the sidebar) and scroll to the **Scholarly Sources** section. Each available source has a toggle. You can turn sources on or off individually — changes take effect immediately for subsequent generations.

By default, Matthew Henry's Concise Commentary is enabled.

## When to turn sources off

Sources are always optional. You might turn them off if:

- You're working from a passage where the commentary's perspective doesn't align with your tradition
- You're preparing a devotional or speaking moment where scholarly background isn't needed
- You want to experience the AI's output without any scholarly influence for comparison

You can turn them back on at any time.`,
  },

  // ── Library ──────────────────────────────────────────────────────────────
  {
    slug: "your-library",
    title: "Your Library",
    category: "Library",
    body: `The Library is where every piece of AI-generated content you choose to save ends up — songs, liturgy, speaking moments, devotionals, applications, illustrations, and more. Think of it as your creative filing cabinet, searchable and organised by type.

## What's in the Library

The Library holds **outputs from the AI generators** that you've explicitly saved. Nothing lands here automatically — you always choose to save. This keeps the Library from becoming cluttered with drafts you didn't intend to keep.

Items are organised by kind:

- **Songs** — from the Song Assistant, Service Builder, or Worship Integration
- **Liturgy** — calls to worship, responsive readings, prayers, benedictions
- **Speaking moments** — transitions, welcomes, offering introductions
- **Devotionals** — brief devotionals for various settings
- **Applications** and **Illustrations** — from the Sermon Builder's dedicated tabs
- **Other** — miscellaneous saved content

## Browsing and searching

At the top of the Library page, a tab bar lets you filter by kind. Each tab shows only that type of saved item. You can also use the search field to find items by title or content keyword.

## The Repertoire tab

Songs saved to the Library have a special sub-category: the **Our Repertoire** tab. Songs starred as part of your repertoire appear here, sorted alphabetically. See *Managing Your Song Repertoire* for details on how the repertoire works with the Song Assistant.

## Using Library items

From the Library, you can:

- **Link a saved item to a service plan slot** via the Slot Picker in the Service Detail view
- **Copy the text** to paste into a manuscript, email, or bulletin
- **Delete items** you no longer need (permanent — there is no trash)

## The difference between Library and Resource Library

The **Library** stores AI-generated outputs — content the AI wrote that you've chosen to keep.

The **Resource Library** stores text sources you bring in yourself — commentary excerpts, personal notes, outside research — for the AI to read during generation.

These are two separate places with two different purposes. The Library is your output archive. The Resource Library is your input archive.`,
  },

  // ── Account & Settings ──────────────────────────────────────────────────────
  {
    slug: "settings-and-billing",
    title: "Settings & Billing",
    category: "Account & Settings",
    body: `The Settings page is where you manage your account, configure scholarly sources, and access billing. Navigate there via the gear icon at the bottom of the sidebar or at /settings.

## Account information

The top section of Settings shows your name and email address as registered with your account. If you need to update your email, use the account management link provided in that section.

## Scholarly Sources

The **Scholarly Sources** panel lists the bundled public-domain commentaries available in Sunday Studio. Each source has a toggle — flip it on to include that commentary in Sermon Builder generations, flip it off to exclude it.

By default, Matthew Henry's Concise Commentary is enabled. As new commentaries are added to the library, they'll appear here with their own toggle. Changes take effect immediately for all subsequent generations — you don't need to restart anything.

See the *Scholarly Sources* article for more detail on what these sources are and how the AI uses them.

## Managing your subscription

Sunday Studio is a subscription service. The **Billing** section of Settings shows your current plan and links to the billing portal where you can:

- View your current plan and renewal date
- Update your payment method
- Download past invoices
- Cancel your subscription

If you have questions about charges or billing that aren't answered in the portal, contact support through the link in the Settings page.

## Trial accounts

If you're in a free trial, the Settings page shows how many days remain. Trial accounts have access to all features — nothing is held back during the trial period. When the trial ends, you'll need a paid subscription to continue generating content.

## Signing out

Click **Sign out** at the bottom of the Settings page to end your session. Your data remains saved in your account — signing out doesn't delete anything.`,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  console.log(`Seeding ${ARTICLES.length} help articles…\n`);

  let inserted = 0;
  let skipped = 0;

  for (const a of ARTICLES) {
    const res = await client.query(
      `INSERT INTO help_articles (slug, title, body, category, published, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [a.slug, a.title, a.body, a.category],
    );
    if (res.rowCount && res.rowCount > 0) {
      console.log(`  ✓ inserted  ${a.slug}`);
      inserted++;
    } else {
      console.log(`  - skipped   ${a.slug}  (already exists)`);
      skipped++;
    }
  }

  await client.end();

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);

  if (inserted + skipped !== ARTICLES.length) {
    console.error("ERROR: unexpected row count mismatch");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
