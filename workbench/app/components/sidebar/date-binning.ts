import { format, isAfter, isThisWeek, isThisYear, isToday, isYesterday, subDays } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import type { ChatHistoryItem } from '~/lib/persistence';

type Bin = { category: string; items: ChatHistoryItem[] };

export function binDates(_list: ChatHistoryItem[]) {
  const list = _list.toSorted((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const binLookup: Record<string, Bin> = {};
  const bins: Array<Bin> = [];

  list.forEach((item) => {
    const category = dateCategory(new Date(item.timestamp));

    if (!(category in binLookup)) {
      const bin = {
        category,
        items: [item],
      };

      binLookup[category] = bin;

      bins.push(bin);
    } else {
      binLookup[category].items.push(item);
    }
  });

  return bins;
}

// A2: sidebar date bins use Chinese labels.
function dateCategory(date: Date) {
  if (isToday(date)) {
    return '今天';
  }

  if (isYesterday(date)) {
    return '昨天';
  }

  if (isThisWeek(date)) {
    // e.g., "星期一"
    return format(date, 'eeee', { locale: zhCN });
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  if (isAfter(date, thirtyDaysAgo)) {
    return '最近 30 天';
  }

  if (isThisYear(date)) {
    // e.g., "七月"
    return format(date, 'MMMM', { locale: zhCN });
  }

  // e.g., "七月 2023"
  return format(date, 'MMMM yyyy', { locale: zhCN });
}
