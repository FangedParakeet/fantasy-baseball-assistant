/**
 * Simple logger. Replace with your own Logger implementation if needed.
 */
export const Logger = {
	error(err: unknown, context?: string): void {
		const prefix = context ? `[${context}] ` : "";
		if (err instanceof Error) {
			console.error(`${prefix}${err.message}`, err.stack);
		} else {
			console.error(`${prefix}`, err);
		}
	},
};
