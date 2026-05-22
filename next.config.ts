import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
	output: "standalone",
	// SpreadJS Designer React 组件使用 class component + componentWillUnmount 调用 designer.destroy()
	// React Strict Mode 双重调用会导致 destroy() 在未完全初始化的实例上执行，触发 docProps.L0 is not a function
	reactStrictMode: false,
};

const analyzer = withBundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

export default analyzer(nextConfig);
