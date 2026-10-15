"use client";

import { AppShell } from "@/components/layout/app-shell";
import { AppDataProvider } from "@/context/app-data-context";
import { NavigationProvider } from "@/context/navigation-context";
import { ReviewProvider } from "@/context/review-context";

export default function FlashcardApp() {
    return <AppDataProvider>
        <NavigationProvider>
            <ReviewProvider>
                <AppShell />
            </ReviewProvider>
        </NavigationProvider>
    </AppDataProvider>;
}
