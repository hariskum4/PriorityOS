/**
 * Life OS HTTP surface.
 *
 * Thin by design: every endpoint either runs a cycle or manages the records the
 * cycle reads. No decision about what a person should see lives here — that is
 * all in the kernel, where it can be tested.
 */
import {
  Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Domain } from '@priority/life-os';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { LifeOsService } from './life-os.service';
import { LifeDocumentService } from './life-document.service';
import { LifeTimelineService } from './life-timeline.service';
import { LifeOrganismService } from './life-organism.service';
import { StacksService } from './stacks.service';
import { RhythmsService } from './rhythms.service';
import { FocusService } from './focus.service';
import { BlueprintService } from './blueprint.service';
import { RankingService } from './ranking.service';
import { SetDomainRankingDto } from './ranking.dto';

@UseGuards(JwtGuard)
@Controller('life-os')
export class LifeOsController {
  constructor(
    private lifeOs: LifeOsService,
    private document: LifeDocumentService,
    private timeline: LifeTimelineService,
    private organism: LifeOrganismService,
    private stacks: StacksService,
    private rhythms: RhythmsService,
    private focusSvc: FocusService,
    private blueprint: BlueprintService,
    private ranking: RankingService,
  ) {}

  /**
   * The Record's opening image: this life grown as one organism.
   *
   * Returns SVG markup rather than a URL so the client has no second fetch and
   * nothing is written to disk. `?refresh=1` skips the ten-minute cache.
   */
  @Get('organism')
  async organismSvg(
    @CurrentUser() u: JwtUser,
    @Query('sky') sky?: string,
    @Query('refresh') refresh?: string,
    @Query('year') year?: string,
  ) {
    const asOf = Number(year);
    return {
      svg: await this.organism.svg(
        u.userId,
        sky === 'light' ? 'light' : 'dark',
        refresh === '1',
        Number.isFinite(asOf) && asOf > 1900 ? asOf : undefined,
      ),
    };
  }

  /** The years this life can be drawn at — the frames of its growth. */
  @Get('organism/years')
  async organismYears(@CurrentUser() u: JwtUser) {
    return { years: await this.timeline.actYears(u.userId) };
  }

  /**
   * Today, reduced.
   *
   * `?preview=1` runs without advancing the ration clock or marking anything
   * seen — for debugging a day without spending the week's profound truth.
   */
  @Get('today')
  async today(@CurrentUser() u: JwtUser, @Query('preview') preview?: string) {
    const result = await this.lifeOs.runToday(u.userId, { persist: preview !== '1' });
    return {
      now: result.now,
      proposals: result.proposals,
      /** Everything noticed, for the Reflect surfaces and for audit. */
      observations: result.observations,
      /**
       * Why the screen is calm. Exposed rather than hidden so the reduction is
       * inspectable in the client too, not just in tests.
       */
      suppressed: result.suppressed.map((s) => ({
        reason: s.reason,
        action: s.proposal.action,
        engine: s.proposal.engine,
      })),
      failures: result.failures,
      ranAt: result.ranAt,
    };
  }

  /** The full engine context — what the engines were allowed to see. */
  @Get('context')
  context(@CurrentUser() u: JwtUser) {
    return this.lifeOs.buildContext(u.userId);
  }

  /**
   * The influence graph at current standing — the whole of it.
   *
   * It used to return `ofKind('domain')` and the risks, with no edges at all,
   * which made the graph impossible to inspect from outside: the couplings
   * that are the entire point were computed, used, and never shown. Nodes now
   * include the people, rhythms and goals the graph actually holds.
   */
  @Get('graph')
  async graph(@CurrentUser() u: JwtUser) {
    const graph = await this.lifeOs.graphFor(u.userId);
    const nodes = [
      ...graph.ofKind('domain'),
      ...graph.ofKind('person'),
      ...graph.ofKind('goal'),
      ...graph.ofKind('habit'),
    ];
    return {
      nodes,
      edges: nodes.flatMap((n) => graph.neighbours(n.id)),
      risks: graph.loadBearingRisks().map((r) => ({
        domain: r.node.id,
        label: r.node.label,
        state: r.node.state,
        dependents: r.dependents,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Focus — a declared season
  // -------------------------------------------------------------------------

  /** The season currently running, with what it is costing. Null when none. */
  @Get('focus')
  focus(@CurrentUser() u: JwtUser) {
    return this.focusSvc.current(u.userId);
  }

  /**
   * What choosing this would cost, without choosing it.
   *
   * The trade is priced before it is agreed to. Discovering six weeks later
   * that a friendship went quiet is the failure this endpoint exists to stop.
   */
  @Get('focus/preview')
  previewFocus(
    @CurrentUser() u: JwtUser,
    @Query('domain') domain: Domain,
    @Query('days') days?: string,
  ) {
    return this.focusSvc.preview(u.userId, domain, days ? Number(days) : undefined);
  }

  @Post('focus')
  chooseFocus(
    @CurrentUser() u: JwtUser,
    @Body() body: { domain: Domain; days?: number; reason?: string },
  ) {
    return this.focusSvc.choose(u.userId, body);
  }

  /** Ending one early is as legitimate as letting it run out. */
  @Delete('focus')
  endFocus(@CurrentUser() u: JwtUser) {
    return this.focusSvc.end(u.userId);
  }

  /** Why one part of this life is reaching another. */
  @Get('graph/explain')
  explain(
    @CurrentUser() u: JwtUser,
    @Query('from') from: Domain,
    @Query('to') to: Domain,
  ) {
    return this.lifeOs.explainInfluence(u.userId, from, to);
  }

  /** What a change in one domain would propagate to. */
  @Get('graph/propagate')
  async propagate(
    @CurrentUser() u: JwtUser,
    @Query('domain') domain: Domain,
    @Query('delta') delta?: string,
  ) {
    const graph = await this.lifeOs.graphFor(u.userId);
    return graph.propagate(domain, Number(delta ?? 10));
  }

  /**
   * Steal the time — stolen hours ranked by what is starving, worded for
   * this life. Falls back to the catalog wording whenever AI is off or fails,
   * so the shape of the response never depends on a model being up.
   */
  @Get('stacks')
  stealTheTime(@CurrentUser() u: JwtUser, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.stacks.forUser(u.userId, Number.isFinite(n) ? Math.min(Math.max(n, 1), 6) : 3);
  }

  /**
   * The standing rhythms each part of this life is still missing.
   *
   * The lens cards used to read these off the end of the domain ladder, whose
   * rungs are written as buttons for a page that supplies the missing noun —
   * so purpose offered "Give it a standing hour" and career offered an
   * instruction to work less. Rhythms have their own catalog now, and this
   * puts that catalog into the reader's own vocabulary.
   */
  @Get('rhythms')
  missingRhythms(@CurrentUser() u: JwtUser) {
    return this.rhythms.forUser(u.userId);
  }

  /**
   * A new order for what matters.
   *
   * The ranking given at onboarding drove every derived number on the Time
   * tab and could never be revised, so a life that had moved on had no way
   * to say so. This moves `priorityRank` — the actual input — rather than
   * the importance score it produces, because that score is recomputed on
   * every habit tick and a weight written straight onto the row would
   * silently revert the first time the reader ticked anything.
   */
  @Patch('domains/ranking')
  reorderDomains(@CurrentUser() u: JwtUser, @Body() body: SetDomainRankingDto) {
    return this.ranking.setOrder(u.userId, body.order);
  }

  /**
   * Not this one.
   *
   * The blueprint writes a catalog for one person, and some of what it writes
   * will be wrong about them. Saying so has to cost one tap and has to stick —
   * an app that re-proposes the thing you just rejected is not listening,
   * whatever it says on the card.
   *
   * The row is switched off rather than deleted, so the next generation still
   * knows this was offered and refused. 404 when the key belongs to nobody,
   * because a silent success would hide a client sending the wrong id.
   */
  @Post('blueprint/:key/retire')
  async retireBlueprintItem(@CurrentUser() u: JwtUser, @Param('key') key: string) {
    const done = await this.blueprint.retire(u.userId, key);
    if (!done) throw new NotFoundException('No such blueprint item');
    return { retired: true, key };
  }

  // ---- the timeline ------------------------------------------------------

  /** Which calendar years hold anything — marks the life-in-years grid. */
  @Get('timeline/years')
  async timelineYears(@CurrentUser() u: JwtUser) {
    const years = await this.timeline.yearsWithActivity(u.userId);
    return { years };
  }

  /** Weekly domain history — what the sky looked like before today. */
  @Get('drift')
  drift(@CurrentUser() u: JwtUser, @Query('weeks') weeks?: string) {
    // No `weeks` means the whole record, which is the default the sky wants.
    return this.timeline.drift(u.userId, weeks ? Number(weeks) : null);
  }

  /**
   * How often each part of a life is actually touched, and what is in it.
   *
   * One request rather than one per domain: the sky needs every period up
   * front to place anything at all, and a domain must open the instant it is
   * tapped. Twelve domains of capped contents is small enough to send whole.
   */
  @Get('rhythm')
  rhythm(@CurrentUser() u: JwtUser) {
    return this.timeline.rhythm(u.userId);
  }

  /** What changed while they were away. */
  @Get('since')
  since(@CurrentUser() u: JwtUser, @Query('at') at?: string) {
    const parsed = at ? new Date(at) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    // A first open, or a nonsense timestamp, means "since yesterday" rather
    // than an error — this is a greeting, not a query.
    return this.timeline.since(u.userId, valid ?? new Date(Date.now() - 86_400_000));
  }

  /**
   * One year as days.
   *
   * Days carry a `dominant` domain, never an intensity — see the service for
   * why this is deliberately not a contributions graph.
   */
  @Get('timeline/:year')
  timelineYear(@CurrentUser() u: JwtUser, @Param('year') year: string) {
    return this.timeline.year(u.userId, Number(year));
  }

  // ---- the life document -------------------------------------------------

  /**
   * Everything the system knows, as readable markdown.
   *
   * Generated per request from Postgres — deliberately never stored, so it
   * cannot drift from the data it describes.
   */
  @Get('document')
  async document_(@CurrentUser() u: JwtUser) {
    const [markdown, summary] = await Promise.all([
      this.document.render(u.userId),
      this.document.summary(u.userId),
    ]);
    return { markdown, summary, generatedAt: new Date() };
  }

  // ---- capture -----------------------------------------------------------

  /**
   * A spoken note, already transcribed on the device.
   *
   * Accepts text only — audio never leaves the phone. Returns what it filed and
   * why, so the guess can be corrected rather than trusted.
   */
  @Post('capture')
  capture(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.lifeOs.capture(u.userId, body);
  }

  // ---- acting on a proposal ---------------------------------------------

  @Post('proposals/:id/accept')
  accept(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.lifeOs.acceptProposal(u.userId, id, body);
  }

  /** `{ forever: true, domain }` retires the whole topic, permanently. */
  @Post('proposals/:id/dismiss')
  dismiss(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.lifeOs.dismissProposal(u.userId, id, body);
  }

  @Get('declined')
  declined(@CurrentUser() u: JwtUser) {
    return this.lifeOs.declinedTopics(u.userId).then((declinedTopics) => ({ declinedTopics }));
  }

  /** The only way back out of Retreat — deliberately explicit. */
  @Post('declined/:topic/restore')
  restore(@CurrentUser() u: JwtUser, @Param('topic') topic: string) {
    return this.lifeOs.restoreTopic(u.userId, topic);
  }

  // ---- decisions ---------------------------------------------------------

  @Get('decisions')
  decisions(@CurrentUser() u: JwtUser) {
    return this.lifeOs.listDecisions(u.userId);
  }

  @Post('decisions')
  createDecision(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.lifeOs.createDecision(u.userId, body);
  }

  /** The full assessment for one decision: lean, findings, and its objection. */
  @Get('decisions/:id')
  assess(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.lifeOs.assessDecision(u.userId, id);
  }

  /** Record what they actually chose — the raw material for judging our leans. */
  @Patch('decisions/:id')
  decide(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.lifeOs.decide(u.userId, id, body);
  }

  // ---- knowledge ---------------------------------------------------------

  @Get('knowledge')
  knowledge(@CurrentUser() u: JwtUser) {
    return this.lifeOs.listKnowledge(u.userId);
  }

  @Post('knowledge')
  addKnowledge(@CurrentUser() u: JwtUser, @Body() body: any) {
    return this.lifeOs.addKnowledge(u.userId, body);
  }

  @Patch('knowledge/:id')
  updateKnowledge(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: any) {
    return this.lifeOs.updateKnowledge(u.userId, id, body);
  }

  /** Manual snapshot; the cron does this weekly. */
  @Post('snapshot')
  async snapshot(@CurrentUser() u: JwtUser) {
    const domains = await this.lifeOs.snapshotWeek(u.userId);
    return { domains };
  }
}
