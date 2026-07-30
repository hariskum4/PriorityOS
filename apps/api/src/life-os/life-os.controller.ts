/**
 * Life OS HTTP surface.
 *
 * Thin by design: every endpoint either runs a cycle or manages the records the
 * cycle reads. No decision about what a person should see lives here — that is
 * all in the kernel, where it can be tested.
 */
import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Domain } from '@priority/life-os';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { LifeOsService } from './life-os.service';
import { LifeDocumentService } from './life-document.service';
import { LifeTimelineService } from './life-timeline.service';
import { LifeOrganismService } from './life-organism.service';
import { StacksService } from './stacks.service';

@UseGuards(JwtGuard)
@Controller('life-os')
export class LifeOsController {
  constructor(
    private lifeOs: LifeOsService,
    private document: LifeDocumentService,
    private timeline: LifeTimelineService,
    private organism: LifeOrganismService,
    private stacks: StacksService,
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

  /** The domain influence graph at current standing. */
  @Get('graph')
  async graph(@CurrentUser() u: JwtUser) {
    const graph = await this.lifeOs.graphFor(u.userId);
    return {
      nodes: graph.ofKind('domain'),
      risks: graph.loadBearingRisks().map((r) => ({
        domain: r.node.id,
        state: r.node.state,
        dependents: r.dependents,
      })),
    };
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
