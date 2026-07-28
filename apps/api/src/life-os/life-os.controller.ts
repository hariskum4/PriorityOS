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

@UseGuards(JwtGuard)
@Controller('life-os')
export class LifeOsController {
  constructor(
    private lifeOs: LifeOsService,
    private document: LifeDocumentService,
    private timeline: LifeTimelineService,
  ) {}

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

  // ---- the timeline ------------------------------------------------------

  /** Which calendar years hold anything — marks the life-in-years grid. */
  @Get('timeline/years')
  async timelineYears(@CurrentUser() u: JwtUser) {
    const years = await this.timeline.yearsWithActivity(u.userId);
    return { years };
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
