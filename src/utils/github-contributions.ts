/**
 * GitHub 贡献热力图数据获取模块。
 *
 * 数据源优先级：
 * 1. GitHub 官方 GraphQL contributions API（构建时，需 GITHUB_TOKEN，含私有仓库贡献）
 * 2. 第三方 jogruber contributions 镜像（无需鉴权，仅公开仓库贡献）
 */

export type ContributionEntry = {
	/** YYYY-MM-DD（UTC） */
	date: string;
	count: number;
	/** 0-4，对应组件的 github-calendar-level-N */
	level: number;
};

export type CalendarWindow = {
	days: ContributionEntry[];
	totalContributions: number;
	activeDays: number;
};

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const JOGRUBER_ENDPOINT = "https://github-contributions-api.jogruber.de/v4";
const FETCH_TIMEOUT_MS = 8000;

/** GraphQL ContributionLevel 枚举 → 现有 0-4 等级映射 */
const GRAPHQL_LEVEL_MAP: Record<string, number> = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
};

export function mapGraphQLLevel(contributionLevel: string): number {
	return GRAPHQL_LEVEL_MAP[contributionLevel] ?? 0;
}

type GraphQLCalendarResponse = {
	data?: {
		user?: {
			contributionsCollection?: {
				contributionCalendar?: {
					totalContributions?: number;
					weeks?: Array<{
						contributionDays?: Array<{
							date: string;
							contributionCount: number;
							contributionLevel: string;
						}>;
					}>;
				};
			};
		};
	};
	errors?: Array<{ message?: string }>;
};

/** 把 GraphQL contributionCalendar 响应摊平为按日期升序的 ContributionEntry[] */
export function parseGraphQLCalendar(
	json: GraphQLCalendarResponse,
): ContributionEntry[] {
	const weeks =
		json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks ??
		[];
	const entries: ContributionEntry[] = [];
	for (const week of weeks) {
		for (const day of week.contributionDays ?? []) {
			if (!day?.date) continue;
			entries.push({
				date: day.date,
				count: day.contributionCount ?? 0,
				level: mapGraphQLLevel(day.contributionLevel),
			});
		}
	}
	entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	return entries;
}

const CONTRIBUTION_CALENDAR_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
  }
}`;

/**
 * 构建时调用：GitHub 官方 GraphQL API。
 * token 属主查询自己时可拿到私有仓库贡献（PAT 需 read:user 权限）。
 * 失败时抛异常，由调用方决定是否回退到 jogruber。
 */
export async function fetchGraphQLContributions(
	username: string,
	token: string,
	fromISO: string,
	toISO: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ContributionEntry[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetchImpl(GITHUB_GRAPHQL_ENDPOINT, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `bearer ${token}`,
				"user-agent": "firefly-blog-github-heatmap",
			},
			body: JSON.stringify({
				query: CONTRIBUTION_CALENDAR_QUERY,
				variables: { login: username, from: fromISO, to: toISO },
			}),
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`GitHub GraphQL 请求失败: HTTP ${response.status}`);
		}
		const json = (await response.json()) as GraphQLCalendarResponse;
		if (json.errors?.length) {
			throw new Error(
				`GitHub GraphQL 返回错误: ${json.errors
					.map((e) => e.message ?? "unknown")
					.join("; ")}`,
			);
		}
		return parseGraphQLCalendar(json);
	} finally {
		clearTimeout(timer);
	}
}

/** 兜底数据源：jogruber 第三方镜像，无需鉴权，仅统计公开仓库贡献。 */
export async function fetchJogruberContributions(
	username: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ContributionEntry[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetchImpl(
			`${JOGRUBER_ENDPOINT}/${username}?y=last`,
			{
				headers: { "user-agent": "Mozilla/5.0" },
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			throw new Error(`jogruber 请求失败: HTTP ${response.status}`);
		}
		const data = await response.json();
		const daysData: Array<{ date: string; count: number; level: number }> =
			data.contributions || [];
		return daysData.map((d) => ({
			date: d.date,
			count: d.count,
			level: d.level,
		}));
	} finally {
		clearTimeout(timer);
	}
}

function formatISODateUTC(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * 把任意来源的贡献记录对齐到「最近 totalDays 天」的 UTC 窗口：
 * 窗口内缺失的日期补 0，窗口外的记录丢弃，输出按日期升序。
 */
export function buildCalendarWindow(
	entries: ContributionEntry[],
	totalDays: number,
	today: Date = new Date(),
): CalendarWindow {
	const endDate = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
	);
	const startTime = endDate.getTime() - (totalDays - 1) * 86400000;

	const entryMap = new Map(entries.map((e) => [e.date, e]));
	const days: ContributionEntry[] = [];
	for (
		let t = startTime;
		t <= endDate.getTime();
		t += 86400000
	) {
		const date = formatISODateUTC(new Date(t));
		const found = entryMap.get(date);
		days.push({
			date,
			count: found ? found.count : 0,
			level: found ? found.level : 0,
		});
	}

	return {
		days,
		totalContributions: days.reduce((sum, d) => sum + d.count, 0),
		activeDays: days.filter((d) => d.count > 0).length,
	};
}
