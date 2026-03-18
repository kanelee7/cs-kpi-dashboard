'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BarChart3, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { normalizeBrandId } from '@/services/brandResolver';
import { CompactModeProvider, useCompactMode } from '@/context/CompactModeContext';

const SIDEBAR_W = 260;

const BRAND_OPTIONS = [
    { value: 'ALL', label: 'All Brands' },
    { value: 'league-of-kingdoms', label: 'League of Kingdoms' },
    { value: 'arena-z', label: 'Arena-Z' },
    { value: 'lok-chronicle', label: 'LOK Chronicle' },
    { value: 'lok-hunters', label: 'LOK Hunters' },
    { value: 'the-new-order', label: 'The New Order' },
];

/**
 * Isolated sub-component that reads searchParams.
 * Must be wrapped in <Suspense> to avoid Next.js CSR bailout.
 */
function SearchParamsSync({ onBrand }: { onBrand: (b: string | null) => void }) {
    const searchParams = useSearchParams();
    useEffect(() => {
        onBrand(normalizeBrandId(searchParams?.get('brand')));
    }, [searchParams, onBrand]);
    return null;
}

function HeaderRightControls({
    brand,
    onBrandChange,
    pathname,
}: {
    brand: string | null;
    onBrandChange: (next: string | null) => void;
    pathname: string | null;
}) {
    const { isCompact, toggleCompact } = useCompactMode();
    const showCompactToggle = pathname === '/dashboard/overview';

    return (
        <div className="flex items-center gap-3">
            {showCompactToggle && (
                <button
                    onClick={toggleCompact}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${isCompact
                        ? 'bg-[#4FBDBA] text-white'
                        : 'bg-[#232424] text-gray-300 hover:text-white border border-gray-700/50'
                        }`}
                >
                    {isCompact ? 'Full View' : 'Compact Mode'}
                </button>
            )}
            <select
                value={brand ?? 'ALL'}
                onChange={e => {
                    const next = e.target.value;
                    const nextBrand = next === 'ALL' ? null : next;
                    onBrandChange(nextBrand);
                }}
                className="bg-[#282929] text-white px-4 py-2 rounded-lg border border-gray-700/50 focus:border-[#4FBDBA] focus:outline-none text-sm"
            >
                {BRAND_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [brand, setBrand] = useState<string | null>(null);

    const handleBrand = useCallback((b: string | null) => {
        setBrand(b);
    }, []);

    const handleBrandChange = useCallback(
        (nextBrand: string | null) => {
            setBrand(nextBrand);
            router.replace(withBrand(pathname || '/dashboard', nextBrand));
        },
        [pathname, router],
    );

    function withBrand(path: string, b: string | null): string {
        if (!b) return path;
        return `${path}?brand=${encodeURIComponent(b)}`;
    }

    const navTop = [
        {
            label: 'CS Dashboard',
            href: withBrand('/dashboard/overview', brand),
            icon: <LayoutDashboard className="w-5 h-5" />,
            active: pathname === '/dashboard/overview' || pathname === '/dashboard',
        },
        {
            label: 'Ticket Management',
            href: withBrand('/dashboard/ticket-management', brand),
            icon: <FileText className="w-5 h-5" />,
            active: pathname === '/dashboard/ticket-management',
        },
        {
            label: 'VOC Dashboard',
            href: withBrand('/dashboard/voc', brand),
            icon: <BarChart3 className="w-5 h-5" />,
            active: pathname === '/dashboard/voc',
        },
        {
            label: 'Leadership',
            href: withBrand('/leadership', brand),
            icon: <Users className="w-5 h-5" />,
            active: pathname === '/leadership',
        },
        {
            label: 'EmbedChart',
            href: withBrand('/embed-chart', brand),
            icon: <BarChart3 className="w-5 h-5" />,
            active: pathname === '/embed-chart',
        },
    ];

    const navBottom = [
        { label: 'Settings', href: '#', icon: <Settings className="w-5 h-5" /> },
        { label: 'Logout', href: '#', icon: <LogOut className="w-5 h-5" /> },
    ];

    const sidebarNav = (
        <div className="flex flex-col h-full">
            {/* Top navigation */}
            <nav className="flex-1 pt-6 px-4 space-y-1">
                {navTop.map(item => (
                    <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${item.active
                            ? 'bg-[#4FBDBA]/10 text-[#4FBDBA]'
                            : 'text-gray-400 hover:text-white hover:bg-[#1f2937]'
                            }`}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            {/* Bottom navigation — always sticks to bottom */}
            <nav className="px-4 pb-6 pt-4 border-t border-gray-800 space-y-1">
                {navBottom.map(item => (
                    <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors text-sm"
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>
        </div>
    );

    return (
        <CompactModeProvider>
        <div className="min-h-screen bg-[#282929] text-white">
            {/* Sync brand from URL without causing Suspense cascade on the whole layout */}
            <Suspense fallback={null}>
                <SearchParamsSync onBrand={handleBrand} />
            </Suspense>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Fixed sidebar — exact same width on every route, no layout shift */}
            <aside
                style={{ width: SIDEBAR_W }}
                className={`fixed left-0 top-0 h-full bg-[#232424] z-50 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
                    } lg:translate-x-0 border-r border-gray-800/40`}
            >
                {/* Mobile close */}
                <div className="flex items-center justify-end p-4 lg:hidden">
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="text-gray-400 hover:text-white"
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {sidebarNav}
            </aside>

            {/* Content area — fixed margin matches sidebar width exactly */}
            <div
                className="flex flex-col min-h-screen bg-[#282929]"
                style={{ marginLeft: SIDEBAR_W }}
            >
                {/* Shared top header with brand selector */}
                <header className="bg-[#232424] border-b border-gray-800/40 shrink-0">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="text-gray-400 hover:text-white lg:hidden"
                            aria-label="Open menu"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="hidden lg:block" />
                        <HeaderRightControls brand={brand} onBrandChange={handleBrandChange} pathname={pathname} />
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1 p-6">{children}</main>
            </div>
        </div>
        </CompactModeProvider>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#111111] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#4FBDBA]" />
            </div>
        }>
            <AppLayoutInner>{children}</AppLayoutInner>
        </Suspense>
    );
}
