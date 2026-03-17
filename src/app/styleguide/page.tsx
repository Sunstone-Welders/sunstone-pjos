'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Textarea,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { applyAccentColor, isValidHexColor } from '@/lib/theme';

/* ───────── Helpers ───────── */

function Swatch({
  color,
  label,
  textDark = true,
}: {
  color: string;
  label: string;
  textDark?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-md border border-[var(--border-default)]"
        style={{ background: color }}
      />
      <span className="text-xs  text-text-secondary">{label}</span>
    </div>
  );
}

function CSSVarSwatch({
  varName,
  label,
  textDark = true,
}: {
  varName: string;
  label: string;
  textDark?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-16 h-16 rounded-md border border-[var(--border-default)]"
        style={{ background: `var(${varName})` }}
      />
      <span className="text-xs  text-text-secondary leading-tight text-center">
        {label}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border-default)] pb-3 mb-8">
      <h2 className="text-2xl font-semibold text-text-primary">{children}</h2>
    </div>
  );
}

function SubSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-medium text-text-primary">{title}</h3>
        {description && (
          <p className="text-sm text-text-secondary mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/* ───────── Default accent hex values (from globals.css) ───────── */

const DEFAULT_ACCENT: Record<string, string> = {
  '50': '#FFF1F7',
  '100': '#FFE1EE',
  '200': '#FFC0DD',
  '300': '#FF99C7',
  '400': '#F070AD',
  '500': '#E1598F',
  '600': '#B1275E',
  '700': '#7A234A',
  '800': '#6F1E44',
  '900': '#541636',
  '950': '#2E0B1D',
};

const NEUTRALS = [
  { label: 'white', color: '#FFFFFF' },
  { label: 'gray-50', color: '#FAFAF9' },
  { label: 'gray-100', color: '#F5F5F4' },
  { label: 'gray-200', color: '#E7E5E4' },
  { label: 'gray-300', color: '#D6D3D1' },
  { label: 'gray-400', color: '#A8A29E' },
  { label: 'gray-500', color: '#78716C' },
  { label: 'gray-600', color: '#57534E' },
  { label: 'gray-700', color: '#44403C' },
  { label: 'gray-800', color: '#292524' },
  { label: 'gray-900', color: '#1C1917' },
  { label: 'black', color: '#000000' },
];

/* ═══════════════════════════════════════════════════════
   Styleguide Page
   ═══════════════════════════════════════════════════════ */

export default function StyleguidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [accentInput, setAccentInput] = useState('#ee7743');
  const [accentApplied, setAccentApplied] = useState(false);

  function handleApplyAccent() {
    if (isValidHexColor(accentInput)) {
      applyAccentColor(accentInput);
      setAccentApplied(true);
    }
  }

  function handleResetAccent() {
    // Reset to defaults by clearing inline styles
    const root = document.documentElement;
    const vars = [
      '--accent-50', '--accent-100', '--accent-200', '--accent-300',
      '--accent-400', '--accent-500', '--accent-600', '--accent-700',
      '--accent-800', '--accent-900', '--accent-950',
      '--accent-primary', '--accent-hover', '--accent-subtle', '--accent-muted',
    ];
    vars.forEach((v) => root.style.removeProperty(v));
    setAccentApplied(false);
    setAccentInput('#ee7743');
  }

  return (
    <div className="bg-surface-base min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* ═══ 1. Header ═══ */}
        <header className="space-y-2">
          <h1 className="font-display text-4xl font-bold text-text-primary tracking-tight">
            Sunstone Design System
          </h1>
          <p className="text-text-secondary text-lg">
            Component &amp; token reference
          </p>
        </header>

        {/* ═══ 2. Color Palette ═══ */}
        <section className="space-y-10">
          <SectionTitle>Color Palette</SectionTitle>

          <SubSection title="Neutrals" description="Base grayscale from white to black">
            <div className="flex flex-wrap gap-3">
              {NEUTRALS.map((n) => (
                <Swatch key={n.label} color={n.color} label={n.label} />
              ))}
            </div>
          </SubSection>

          <SubSection
            title="Accent Scale"
            description="Tenant-customizable brand color — defaults to PJ Rose / Deep Wine"
          >
            <div className="flex flex-wrap gap-3">
              {Object.entries(DEFAULT_ACCENT).map(([step, hex]) => (
                <CSSVarSwatch
                  key={step}
                  varName={`--accent-${step}`}
                  label={`accent-${step}`}
                />
              ))}
            </div>
          </SubSection>

          <SubSection title="Semantic Surfaces" description="Layered backgrounds for depth hierarchy">
            <div className="flex flex-wrap gap-3">
              {[
                { varName: '--surface-base', label: 'base' },
                { varName: '--surface-raised', label: 'raised' },
                { varName: '--surface-subtle', label: 'subtle' },
                { varName: '--surface-overlay', label: 'overlay' },
              ].map((s) => (
                <CSSVarSwatch key={s.label} varName={s.varName} label={s.label} />
              ))}
            </div>
          </SubSection>

          <SubSection title="Semantic Text" description="Warm-tinted text hierarchy">
            <div className="flex flex-wrap gap-4">
              {[
                { varName: '--text-primary', label: 'primary', hex: '#31241B' },
                { varName: '--text-secondary', label: 'secondary', hex: '#85625D' },
                { varName: '--text-tertiary', label: 'tertiary', hex: '#BF9F9A' },
              ].map((t) => (
                <div
                  key={t.label}
                  className="flex items-center gap-3 rounded-md border border-[var(--border-default)] bg-surface-raised px-4 py-3"
                >
                  <span
                    className="text-base font-semibold"
                    style={{ color: `var(${t.varName})` }}
                  >
                    Aa
                  </span>
                  <span className="text-xs  text-text-secondary">
                    text-{t.label} · {t.hex}
                  </span>
                </div>
              ))}
            </div>
          </SubSection>

          <SubSection title="Functional Colors" description="Status & feedback palette">
            <div className="flex flex-wrap gap-3">
              {[
                { name: 'success-50', varName: '--success-50' },
                { name: 'success-500', varName: '--success-500' },
                { name: 'success-600', varName: '--success-600' },
                { name: 'warning-50', varName: '--warning-50' },
                { name: 'warning-500', varName: '--warning-500' },
                { name: 'warning-600', varName: '--warning-600' },
                { name: 'error-50', varName: '--error-50' },
                { name: 'error-500', varName: '--error-500' },
                { name: 'error-600', varName: '--error-600' },
                { name: 'info-50', varName: '--info-50' },
                { name: 'info-500', varName: '--info-500' },
                { name: 'info-600', varName: '--info-600' },
              ].map((c) => (
                <CSSVarSwatch key={c.name} varName={c.varName} label={c.name} />
              ))}
            </div>
          </SubSection>
        </section>

        {/* ═══ 3. Typography ═══ */}
        <section className="space-y-10">
          <SectionTitle>Typography</SectionTitle>

          <SubSection title="Font Families">
            <Card padding="md">
              <div className="space-y-6">
                <div>
                  <p className="text-xs  text-text-tertiary mb-1">
                    Inter (--font-sans) — UI, body, headings
                  </p>
                  <p className="font-sans text-xl text-text-primary">
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
                <div>
                  <p className="text-xs  text-text-tertiary mb-1">
                    Fraunces (--font-display) — Display, branding
                  </p>
                  <p className="font-display text-xl text-text-primary">
                    The quick brown fox jumps over the lazy dog.
                  </p>
                </div>
                <div>
                  <p className="text-xs  text-text-tertiary mb-1">
                    JetBrains Mono (--) — Financial, data
                  </p>
                  <p className=" text-xl text-text-primary">
                    $1,234.56 · 48 ft · SKU-7891
                  </p>
                </div>
              </div>
            </Card>
          </SubSection>

          <SubSection title="Heading Scale" description="Using Inter (font-sans)">
            <Card padding="md">
              <div className="space-y-4">
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">4xl</span>
                  <p className="text-4xl font-bold text-text-primary tracking-tight">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">3xl</span>
                  <p className="text-3xl font-bold text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">2xl</span>
                  <p className="text-2xl font-semibold text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">xl</span>
                  <p className="text-xl font-semibold text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">lg</span>
                  <p className="text-lg font-semibold text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">base</span>
                  <p className="text-base text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">sm</span>
                  <p className="text-sm text-text-primary">Sunstone OS</p>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-xs  text-text-tertiary w-16 shrink-0">xs</span>
                  <p className="text-xs text-text-primary">Sunstone OS</p>
                </div>
              </div>
            </Card>
          </SubSection>

          <SubSection title="Display Text" description="Fraunces for hero / branding moments">
            <Card padding="md">
              <p className="font-display text-4xl font-bold text-text-primary tracking-tight">
                Elegant. Effortless. Yours.
              </p>
            </Card>
          </SubSection>

          <SubSection title="Font Weights">
            <Card padding="md">
              <div className="space-y-2 text-lg text-text-primary">
                <p className="font-normal">
                  <span className="text-xs  text-text-tertiary mr-4 inline-block w-24">normal (400)</span>
                  Permanent jewelry made simple.
                </p>
                <p className="font-medium">
                  <span className="text-xs  text-text-tertiary mr-4 inline-block w-24">medium (500)</span>
                  Permanent jewelry made simple.
                </p>
                <p className="font-semibold">
                  <span className="text-xs  text-text-tertiary mr-4 inline-block w-24">semibold (600)</span>
                  Permanent jewelry made simple.
                </p>
                <p className="font-bold">
                  <span className="text-xs  text-text-tertiary mr-4 inline-block w-24">bold (700)</span>
                  Permanent jewelry made simple.
                </p>
              </div>
            </Card>
          </SubSection>
        </section>

        {/* ═══ 4. Spacing & Radius ═══ */}
        <section className="space-y-10">
          <SectionTitle>Spacing &amp; Radius</SectionTitle>

          <SubSection
            title="Border Radius"
            description="Soft, premium rounding. Applied via --radius-* tokens."
          >
            <div className="flex flex-wrap gap-4">
              {[
                { label: 'sm · 6px', cls: 'rounded-sm' },
                { label: 'base · 10px', cls: 'rounded-base' },
                { label: 'md · 14px', cls: 'rounded-md' },
                { label: 'lg · 16px', cls: 'rounded-lg' },
                { label: 'xl · 24px', cls: 'rounded-xl' },
                { label: 'full', cls: 'rounded-full' },
              ].map((r) => (
                <div key={r.label} className="flex flex-col items-center gap-2">
                  <div
                    className={`w-20 h-20 bg-accent-100 border border-accent-300 ${r.cls}`}
                  />
                  <span className="text-xs  text-text-secondary">
                    {r.label}
                  </span>
                </div>
              ))}
            </div>
          </SubSection>
        </section>

        {/* ═══ 5. Shadows / Elevation ═══ */}
        <section className="space-y-10">
          <SectionTitle>Shadows / Elevation</SectionTitle>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
            {['xs', 'sm', 'base', 'md', 'lg', 'xl'].map((level) => (
              <div key={level} className="flex flex-col items-center gap-3">
                <div
                  className={`w-full aspect-square rounded-lg bg-surface-raised border border-[var(--border-subtle)] shadow-${level}`}
                />
                <span className="text-xs  text-text-secondary">
                  shadow-{level}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ 6. Buttons ═══ */}
        <section className="space-y-10">
          <SectionTitle>Buttons</SectionTitle>

          <SubSection title="Variants" description="primary, secondary, ghost, danger">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </SubSection>

          <SubSection title="Sizes" description="sm, md (default), lg">
            <div className="flex flex-wrap items-end gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </SubSection>

          <SubSection title="States" description="Disabled and loading states">
            <div className="flex flex-wrap gap-3">
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
              <Button loading>Loading…</Button>
              <Button variant="secondary" loading>
                Loading…
              </Button>
            </div>
          </SubSection>

          <SubSection title="All Variants × Sizes">
            <Card padding="md">
              <div className="space-y-4">
                {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
                  <div key={v} className="flex flex-wrap items-end gap-3">
                    <span className="text-xs  text-text-tertiary w-20 shrink-0 pt-2">
                      {v}
                    </span>
                    <Button variant={v} size="sm">Small</Button>
                    <Button variant={v} size="md">Medium</Button>
                    <Button variant={v} size="lg">Large</Button>
                  </div>
                ))}
              </div>
            </Card>
          </SubSection>
        </section>

        {/* ═══ 7. Form Elements ═══ */}
        <section className="space-y-10">
          <SectionTitle>Form Elements</SectionTitle>

          <SubSection title="Input">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input label="Default" placeholder="Enter your name" />
              <Input
                label="With helper text"
                placeholder="hello@example.com"
                helperText="We'll never share your email."
              />
              <Input
                label="With error"
                placeholder="Enter amount"
                defaultValue="abc"
                error="Please enter a valid number."
              />
              <Input label="Disabled" placeholder="Not editable" disabled />
            </div>
          </SubSection>

          <SubSection title="Select">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select
                label="Default"
                options={[
                  { value: '', label: 'Choose an option…' },
                  { value: 'chain', label: 'Chain' },
                  { value: 'charm', label: 'Charm' },
                  { value: 'jump_ring', label: 'Jump Ring' },
                ]}
              />
              <Select
                label="With error"
                error="Selection is required."
                options={[{ value: '', label: 'Choose…' }]}
              />
            </div>
          </SubSection>

          <SubSection title="Textarea">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Textarea
                label="Default"
                placeholder="Enter event notes…"
                rows={3}
              />
              <Textarea
                label="With error"
                error="Notes are required."
                rows={3}
              />
            </div>
          </SubSection>
        </section>

        {/* ═══ 8. Cards ═══ */}
        <section className="space-y-10">
          <SectionTitle>Cards</SectionTitle>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SubSection title="Default" description="Static card with subcomponents">
              <Card>
                <CardHeader>
                  <CardTitle>Rose Gold Chain</CardTitle>
                  <CardDescription>14k rose gold, 18″</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">
                    Premium Italian-sourced chain perfect for permanent bracelets
                    and anklets. Hypoallergenic and tarnish-resistant.
                  </p>
                </CardContent>
                <CardFooter>
                  <Button size="sm">Add to Cart</Button>
                  <Button variant="ghost" size="sm">
                    Details
                  </Button>
                </CardFooter>
              </Card>
            </SubSection>

            <SubSection
              title="Interactive"
              description="Hover to see shadow & border transition"
            >
              <Card variant="interactive">
                <CardHeader>
                  <CardTitle>Saturday Pop-Up</CardTitle>
                  <CardDescription>Farmers Market · Feb 15</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-secondary">
                    Booth #12 — Set up at 8 AM. Bring the rose gold and silver
                    chain inventory. Expect 40+ customers.
                  </p>
                </CardContent>
                <CardFooter>
                  <Badge variant="success">Active</Badge>
                  <span className="text-sm text-text-tertiary">
                    12 sales today
                  </span>
                </CardFooter>
              </Card>
            </SubSection>
          </div>

          <SubSection title="Padding Options" description="none, sm, md, lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(['none', 'sm', 'md', 'lg'] as const).map((p) => (
                <Card key={p} padding={p}>
                  <div className="bg-accent-50 rounded p-2 text-center text-sm  text-text-secondary">
                    padding=&quot;{p}&quot;
                  </div>
                </Card>
              ))}
            </div>
          </SubSection>
        </section>

        {/* ═══ 9. Badges ═══ */}
        <section className="space-y-10">
          <SectionTitle>Badges</SectionTitle>

          <SubSection title="Variants (size md)" description="default, accent, success, warning, error, info">
            <div className="flex flex-wrap gap-3">
              <Badge variant="default">Default</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
              <Badge variant="info">Info</Badge>
            </div>
          </SubSection>

          <SubSection title="Size sm">
            <div className="flex flex-wrap gap-3">
              <Badge variant="default" size="sm">Default</Badge>
              <Badge variant="accent" size="sm">Accent</Badge>
              <Badge variant="success" size="sm">Success</Badge>
              <Badge variant="warning" size="sm">Warning</Badge>
              <Badge variant="error" size="sm">Error</Badge>
              <Badge variant="info" size="sm">Info</Badge>
            </div>
          </SubSection>
        </section>

        {/* ═══ 10. Modal ═══ */}
        <section className="space-y-10">
          <SectionTitle>Modal</SectionTitle>

          <SubSection description="Click the button to open a demo modal with header, body, and footer subcomponents." title="Demo">
            <Button onClick={() => setModalOpen(true)}>Open Modal</Button>

            <Modal
              isOpen={modalOpen}
              onClose={() => setModalOpen(false)}
              size="md"
            >
              <ModalHeader>
                <h3 className="text-lg font-semibold text-text-primary">
                  Confirm Checkout
                </h3>
                <p className="text-sm text-text-tertiary">
                  Review the order before completing the sale.
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-3 text-sm text-text-secondary">
                  <div className="flex justify-between">
                    <span>Rose Gold Chain ×1</span>
                    <span className="">$85.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Star Charm ×2</span>
                    <span className="">$24.00</span>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-3 flex justify-between font-semibold text-text-primary">
                    <span>Total</span>
                    <span className="">$109.00</span>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setModalOpen(false)}>
                  Complete Sale
                </Button>
              </ModalFooter>
            </Modal>
          </SubSection>
        </section>

        {/* ═══ 11. Tabs ═══ */}
        <section className="space-y-10">
          <SectionTitle>Tabs</SectionTitle>

          <SubSection title="Demo" description="Fully accessible with keyboard navigation (arrow keys, Home, End)">
            <Card padding="md">
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="inventory">Inventory</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <p className="text-sm text-text-secondary">
                    Today&apos;s sales are looking great! You&apos;ve processed 14
                    transactions totaling{' '}
                    <span className=" font-semibold text-text-primary">
                      $1,847.50
                    </span>{' '}
                    at the Farmers Market pop-up.
                  </p>
                </TabsContent>
                <TabsContent value="inventory">
                  <p className="text-sm text-text-secondary">
                    Low stock alert: 14k Rose Gold Chain is down to{' '}
                    <span className=" font-semibold text-text-primary">
                      3.5 ft
                    </span>{' '}
                    remaining. Reorder threshold is 10 ft.
                  </p>
                </TabsContent>
                <TabsContent value="settings">
                  <p className="text-sm text-text-secondary">
                    Manage your event settings, tax profiles, waiver text, and
                    payment integrations from the Settings page.
                  </p>
                </TabsContent>
              </Tabs>
            </Card>
          </SubSection>
        </section>

        {/* ═══ 12. Accent Color Demo ═══ */}
        <section className="space-y-10">
          <SectionTitle>Accent Color Demo</SectionTitle>

          <SubSection
            title="Dynamic Brand Theming"
            description="Enter any hex color and apply it to see the entire accent scale regenerate live using applyAccentColor()."
          >
            <Card padding="md">
              <div className="flex flex-wrap items-end gap-3 mb-6">
                <div className="w-48">
                  <Input
                    label="Hex Color"
                    value={accentInput}
                    onChange={(e) => setAccentInput(e.target.value)}
                    placeholder="#ee7743"
                  />
                </div>
                <Button onClick={handleApplyAccent} size="sm">
                  Apply
                </Button>
                <Button variant="secondary" size="sm" onClick={handleResetAccent}>
                  Reset
                </Button>
                {accentApplied && (
                  <Badge variant="success" size="sm">
                    Applied
                  </Badge>
                )}
                {accentInput && !isValidHexColor(accentInput) && (
                  <Badge variant="error" size="sm">
                    Invalid hex
                  </Badge>
                )}
              </div>

              <p className="text-xs text-text-tertiary mb-3">
                Live accent scale (updates when you apply a color):
              </p>
              <div className="flex flex-wrap gap-3">
                {['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map(
                  (step) => (
                    <CSSVarSwatch
                      key={step}
                      varName={`--accent-${step}`}
                      label={step}
                    />
                  )
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-text-tertiary mb-3">
                  Buttons with current accent:
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button size="sm">Primary</Button>
                  <Button variant="secondary" size="sm">
                    Secondary
                  </Button>
                  <Badge variant="accent">Accent Badge</Badge>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-text-tertiary mb-2">
                  Try these brand colors:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Rose Gold', hex: '#ee7743' },
                    { label: 'Emerald', hex: '#10b981' },
                    { label: 'Sapphire', hex: '#3b82f6' },
                    { label: 'Amethyst', hex: '#8b5cf6' },
                    { label: 'Ruby', hex: '#ef4444' },
                    { label: 'Midnight', hex: '#1e293b' },
                  ].map((preset) => (
                    <button
                      key={preset.hex}
                      onClick={() => {
                        setAccentInput(preset.hex);
                        applyAccentColor(preset.hex);
                        setAccentApplied(true);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-default)] bg-surface-raised text-xs text-text-secondary hover:bg-surface-subtle transition-colors"
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/10"
                        style={{ background: preset.hex }}
                      />
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </SubSection>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-[var(--border-default)]">
          <p className="text-sm text-text-tertiary text-center">
            Sunstone Studio Design System · Built with Next.js, Tailwind CSS &amp;
            CSS custom properties
          </p>
        </footer>
      </div>
    </div>
  );
}