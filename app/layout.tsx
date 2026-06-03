import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const geistSans = localFont({
	src: "../public/fonts/Geist[wght].woff2",
	variable: "--font-geist-sans",
	weight: "100 900",
	display: "swap",
});

const geistMono = localFont({
	src: "../public/fonts/GeistMono[wght].woff2",
	variable: "--font-geist-mono",
	weight: "100 900",
	display: "swap",
});

export const metadata: Metadata = {
	title: "SpreadJS AI Agent",
	description: "Conversational spreadsheets powered by SpreadJS and AI.",
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
		],
	},
};

const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem("spreadjs-agent-settings")||"{}").theme||"system";var d=s==="system"?window.matchMedia("(prefers-color-scheme:dark)").matches:s==="dark";if(d){document.documentElement.classList.add("dark");var l=document.createElement("link");l.id="spreadjs-designer-dark-theme";l.rel="stylesheet";l.href="/spreadjs/gc.spread.sheets.designer.dark.min.css";document.head.appendChild(l);var r=document.createElement("link");r.id="spreadjs-runtime-dark-theme";r.rel="stylesheet";r.href="/spreadjs/gc.spread.sheets.excel2016black.css";document.head.appendChild(r)}else{var l=document.createElement("link");l.id="spreadjs-designer-light-theme";l.rel="stylesheet";l.href="/spreadjs/gc.spread.sheets.designer.light.min.css";document.head.appendChild(l);var r=document.createElement("link");r.id="spreadjs-runtime-light-theme";r.rel="stylesheet";r.href="/spreadjs/gc.spread.sheets.excel2013white.css";document.head.appendChild(r)}}catch(e){}})();`;

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<head>
				{/* SpreadJS CSS 预加载：让浏览器提前发现主题样式，减少渲染阻塞 */}
				<link rel="preload" href="/spreadjs/gc.spread.sheets.designer.light.min.css" as="style" />
				<link rel="preload" href="/spreadjs/gc.spread.sheets.excel2013white.css" as="style" />
				<link rel="preload" href="/spreadjs/gc.spread.sheets.designer.dark.min.css" as="style" />
				<link rel="preload" href="/spreadjs/gc.spread.sheets.excel2016black.css" as="style" />
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className="h-full overflow-hidden">
				<AppProviders>{children}</AppProviders>
			</body>
		</html>
	);
}
