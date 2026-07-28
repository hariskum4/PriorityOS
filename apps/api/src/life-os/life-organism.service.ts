import { Injectable } from '@nestjs/common';
import { DOMAIN_TO_LIFE } from '@priority/types';
import { PrismaService } from '../prisma/prisma.service';
import { LifeOsService } from './life-os.service';
import { LifeTimelineService } from './life-timeline.service';
import { renderOrganism, OrganismDomain } from './organism';

/**
 * The Organism — the Record's opening image.
 *
 * Assembles the three real inputs and hands them to the generator:
 *
 *   importance / attention   the twelve domain rows, as the app scores them
 *   acts                     every dated act on record, bucketed by domain
 *   net influence            what the LifeGraph propagates into each domain
 *
 * Like the life document, it is generated on demand and never stored, so it
 * cannot drift from the data it describes. Unlike the document it costs real
 * CPU — the Turing field is a few million cell updates — so one render per
 * user is held briefly in memory.
 */

/**
 * The Observatory's domain hues, both skies, copied from the mobile theme.
 * The organism is drawn on whichever sky the client is in, so it reads as part
 * of the page rather than an image pasted onto it.
 */
const HUE_DARK: Record<string, string> = {
  family: '#F0798A', partner: '#F0637E', children: '#F5A05C', friends: '#C79BF0',
  health: '#34C79A', career: '#5B9BE8', finance: '#E4B33E', growth: '#A78BFA',
  experiences: '#6FC3F0', reflection: '#8E96E8', purpose: '#3FBFB4', impact: '#63C98F',
};
const HUE_LIGHT: Record<string, string> = {
  family: '#C43F55', partner: '#B8304A', children: '#B26A18', friends: '#7B4FA8',
  health: '#0E8C68', career: '#2F6BB8', finance: '#9A7212', growth: '#6D46C4',
  experiences: '#1F6E9E', reflection: '#4A52B8', purpose: '#14827D', impact: '#2C8355',
};

export type Sky = 'dark' | 'light';

/** Standing that counts as par when asking the graph what it is pushing on. */
const PAR = 60;

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class LifeOrganismService {
  private cache = new Map<string, { at: number; svg: string }>();

  constructor(
    private prisma: PrismaService,
    private lifeOs: LifeOsService,
    private timeline: LifeTimelineService,
  ) {}

  async svg(userId: string, sky: Sky = 'dark', force = false): Promise<string> {
    const key = `${userId}:${sky}`;
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.svg;

    const hue = sky === 'light' ? HUE_LIGHT : HUE_DARK;

    const [rows, years, graph] = await Promise.all([
      this.prisma.lifeDomain.findMany({ where: { userId } }),
      this.timeline.yearsWithActivity(userId),
      this.lifeOs.graphFor(userId),
    ]);

    const acts: Record<string, number> = {};
    for (const year of years) {
      const { byDomain } = await this.timeline.year(userId, year);
      for (const [domain, n] of Object.entries(byDomain)) {
        acts[domain] = (acts[domain] ?? 0) + n;
      }
    }

    // Net signed influence arriving at each kernel domain, straight from the
    // graph's own propagate(). A domain below par pushes its neighbours by the
    // published weights; the sum is the field that domain sits in.
    const net: Record<string, number> = {};
    for (const node of graph.ofKind('domain')) {
      const delta = (node.state ?? 0) - PAR;
      if (!delta) continue;
      for (const influence of graph.propagate(node.id, delta)) {
        net[influence.nodeId] = (net[influence.nodeId] ?? 0) + influence.delta;
      }
    }

    const domains: OrganismDomain[] = rows
      .filter((r) => hue[r.domainType])
      .map((r) => ({
        domainType: r.domainType,
        importance: Number(r.importanceScore),
        attention: Number(r.attentionScore),
        acts: acts[r.domainType] ?? 0,
        net: net[DOMAIN_TO_LIFE[r.domainType as keyof typeof DOMAIN_TO_LIFE]] ?? 0,
        color: hue[r.domainType],
      }));

    const svg = renderOrganism(domains, {
      seed: 7,
      field: true,
      ...(sky === 'light'
        // Parchment: no starfield, heavier ink, and the field lifted because a
        // pale ground swallows a low-alpha pattern.
        ? { ground: 'transparent', dust: null, inkWeight: 1.15, fieldGain: 0.34 }
        : { ground: 'transparent', inkWeight: 1, fieldGain: 0.24 }),
    });
    this.cache.set(key, { at: Date.now(), svg });
    return svg;
  }
}
