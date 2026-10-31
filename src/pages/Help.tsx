import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import { BookOpen, Printer } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { isHospitality } from '@/lib/access';
import { searchTopics, topicsFor, type HelpTopic } from '@/help/topics';
import { usePrint } from '@/components/print';
import { Button, Card, EmptyState, PageHeader, SearchInput, cx } from '@/components/ui';

// The guides are our own Markdown files bundled with the app, so rendering them as HTML is safe.
const render = (md: string) => marked.parse(md, { async: false }) as string;

function GuideDoc({ topics }: { topics: HelpTopic[] }) {
  return (
    <div className="prose-kivu help-print">
      {topics.map(t => <article key={t.id} dangerouslySetInnerHTML={{ __html: render(t.body) }} />)}
    </div>
  );
}

export default function Help() {
  const { role, shop } = useShop();
  const print = usePrint();
  const topics = useMemo(() => topicsFor(role, isHospitality(shop.business_type)), [role, shop.business_type]);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const articleRef = useRef<HTMLDivElement>(null);
  const current = topics.find(t => t.id === params.get('topic')) ?? topics[0];
  const results = useMemo(() => searchTopics(topics, query), [topics, query]);
  const html = useMemo(() => render(current.body), [current]);

  const open = (id: string) => {
    setParams({ topic: id });
    setQuery('');
    // On phones the topic list sits above the guide, so bring the guide into view.
    requestAnimationFrame(() => articleRef.current?.scrollIntoView({ block: 'start' }));
  };

  return (
    <>
      <PageHeader
        title="Help & user guide"
        description="How to use Kivu POS, written for your role."
        actions={<>
          <Button icon={<Printer />} onClick={() => print(<GuideDoc topics={[current]} />)}>Print this guide</Button>
          {topics.length > 1 && <Button icon={<BookOpen />} onClick={() => print(<GuideDoc topics={topics} />)}>Print all</Button>}
        </>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-[88px] lg:self-start">
          <SearchInput value={query} onChange={setQuery} placeholder="Search the guide" />
          {query.trim() ? (
            <Card bodyClassName="p-0">
              {results.length ? (
                <ul className="divide-y divide-zinc-100">
                  {results.map(({ topic, excerpt }) => (
                    <li key={topic.id}>
                      <button type="button" onClick={() => open(topic.id)} className="w-full px-4 py-3 text-left hover:bg-zinc-50">
                        <span className="block text-sm font-medium">{topic.title}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{excerpt}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No match" description={`Nothing in the guide mentions "${query.trim()}".`} />}
            </Card>
          ) : (
            <nav aria-label="Guide topics" className="card p-1.5">
              {topics.map(t => (
                <button key={t.id} type="button" onClick={() => open(t.id)} aria-current={t.id === current.id ? 'page' : undefined}
                  className={cx('w-full rounded-lg px-3 py-2 text-left transition', t.id === current.id ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100')}>
                  <span className="block text-sm font-medium">{t.title}</span>
                  <span className={cx('block text-xs', t.id === current.id ? 'text-zinc-300' : 'text-zinc-500')}>{t.summary}</span>
                </button>
              ))}
            </nav>
          )}
        </aside>

        <div ref={articleRef} className="min-w-0 scroll-mt-24">
          <Card bodyClassName="px-5 py-6 sm:px-8">
            <article className="prose-kivu" dangerouslySetInnerHTML={{ __html: html }} />
          </Card>
        </div>
      </div>
    </>
  );
}
