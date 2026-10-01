export type ErrorReportValue =
	string | number | boolean | null | ErrorReportValue[] | { [key: string]: ErrorReportValue };

export interface ErrorReport {
	title: string;
	message: string;
	details?: Record<string, ErrorReportValue>;
}

export function formatErrorReport(report: ErrorReport): string {
	const environment = [
		`- App: basstabs`,
		`- Time: ${new Date().toISOString()}`,
		`- Page: ${location.pathname}`,
		`- Browser: ${navigator.userAgent}`,
		`- Language: ${navigator.language}`,
		`- Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
	];

	return [
		`# ${report.title}`,
		'',
		report.message,
		'',
		'## Details',
		'```json',
		JSON.stringify(report.details ?? {}, null, 2),
		'```',
		'',
		'## Environment',
		...environment
	].join('\n');
}
