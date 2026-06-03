"use client";

import { useState, useEffect } from "react";

export interface ServiceStatus {
	available: boolean;
	missing: string[];
	visionAvailable: boolean;
	loading: boolean;
}

export function useServiceStatus(): ServiceStatus {
	const [status, setStatus] = useState<ServiceStatus>({
		available: true,
		missing: [],
		visionAvailable: true,
		loading: true,
	});

	useEffect(() => {
		fetch("/api/status")
			.then((res) => res.json())
			.then((data: { available: boolean; missing: string[]; visionAvailable: boolean }) => {
				setStatus({
					available: data.available,
					missing: data.missing,
					visionAvailable: data.visionAvailable,
					loading: false,
				});
			})
			.catch(() => {
				setStatus({ available: false, missing: ["(check failed)"], visionAvailable: false, loading: false });
			});
	}, []);

	return status;
}
