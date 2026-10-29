import { vaultAt } from '../economy/shop';
import { VAULT_ORDER } from '../ship/catalogue';
import { buildHangar, type HangarState, monthsUntilVault } from '../ship/hangar';
import type { HangarTab } from '../ui/hangarView';
import { find, keyOf, type Slot } from '../ship/looks';
import { MAX_TIER, SYSTEMS, type SystemId, TIER_COST } from '../ship/upgrades';
import { formatScore } from '../ui/ui';
import type { Game } from '../core/game';

export class HangarScreens {
  constructor(private readonly g: Game) {}

  private hangar: HangarState = { slot: 'hull', pick: null };

  private hangarUpgrades = false; // the upgrades chip is open, not a slot of looks

  /** Open the hangar on a slot of looks (or on the upgrades). `from: 'shop'` makes Back return to the shop. */
  openHangar(opts: { slot?: Slot; upgrades?: boolean; from?: 'shop' } = {}): void {
    this.hangar = { slot: opts.slot ?? this.hangar.slot, pick: null };
    this.hangarUpgrades = opts.upgrades ?? false;
    this.g.hangarFrom = opts.from ?? null;
    this.g.preview = null;
    this.g.applyLooks();
    this.renderHangar(false);
    // Show the ship (and its engine) over the title scene while choosing.
    this.g.player.reset();
    this.g.player.setVisible(true);
    this.g.trail.setVisible(true);
    this.g.openInfo('hangar');
  }

  renderHangar(keepScroll: boolean): void {
    const now = new Date(this.g.now());
    const v = vaultAt(now.getTime());
    const month = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const view = buildHangar(this.hangar, {
      looks: this.g.looks,
      owner: this.g.owner(),
      credits: this.g.wallet.credits,
      cores: this.g.wallet.cores,
      vault: { key: keyOf(v.item), monthsUntil: (key) => monthsUntilVault(key, VAULT_ORDER, month) },
    });
    this.renderUpgrades();
    const credits = `${formatScore(this.g.wallet.credits)} credits`;
    this.g.hangarUi.renderHangar(view, keepScroll, {
      upgrades: this.hangarUpgrades,
      upgradeTag: `${this.g.upgrades.points()}/${SYSTEMS.length * MAX_TIER}`,
      summary: this.hangarUpgrades ? credits : `${view.summary} · ${credits} · ${formatScore(this.g.wallet.cores)} cores`,
    });
  }

  onHangarTab(tab: HangarTab): void {
    this.hangarUpgrades = tab === 'upgrades';
    this.hangar = { slot: tab === 'upgrades' ? this.hangar.slot : tab, pick: null };
    this.g.preview = null;
    this.g.applyLooks();
    this.renderHangar(false);
  }

  /** Tap a look: it goes on the ship to see (owned or not); the button underneath puts it on for good, or buys it. */
  onHangarPick(id: string): void {
    this.hangar.pick = id;
    this.g.preview = { [this.hangar.slot]: id };
    this.g.haptics.pickup();
    this.g.applyLooks();
    this.renderHangar(true);
  }

  onHangarAction(): void {
    const id = this.hangar.pick;
    if (!id) return;
    const item = find(this.hangar.slot, id);
    if (this.g.looks.owns(item, this.g.owner())) {
      this.g.looks.equip(item.slot, item.id);
      this.g.preview = null;
      this.g.sound.pickup();
      this.g.applyLooks();
      this.renderHangar(true);
      return;
    }
    const u = item.unlock;
    if (u.by === 'credits') {
      if (!this.g.wallet.spend(u.cost)) return;
    } else if (u.by === 'cores' || u.by === 'vault') {
      if (this.g.wallet.cores < u.cost || (u.by === 'vault' && keyOf(item) !== keyOf(vaultAt(this.g.now()).item))) return;
      this.g.shop.confirmCores(u.cost, item.name, () => {
        if (!this.g.wallet.spendCores(u.cost)) return;
        this.g.looks.buy(item);
        this.g.shop.afterBuy([item], `${item.name} bought and on your ship`);
        this.renderHangar(true);
      });
      return;
    } else return;
    this.g.looks.buy(item);
    this.g.shop.afterBuy([item], `${item.name} bought and on your ship`);
    this.renderHangar(true);
  }

  onBuyUpgrade = (id: string): void => {
    const sys = id as SystemId;
    const check = this.g.upgrades.check(sys, this.g.wallet.credits, this.g.leagues.league);
    if (!check.ok || !this.g.wallet.spend(check.cost)) return;
    this.g.upgrades.raise(sys);
    this.g.wallet.add(this.g.promoteLeague(null)); // buying the last points may complete a promotion
    this.g.sound.pickup();
    this.g.haptics.pickup();
    this.g.refreshTitle();
    this.renderHangar(true);
  };

  private renderUpgrades(): void {
    const lg = this.g.leagues.current;
    const active = this.g.upgrades.activePoints();
    this.g.ui.setUpgradeNote(
      `${active} of ${this.g.upgrades.points()} points on · ${lg.name} league cap ${lg.max}${active > lg.max ? ' (over: switch some off for ranked)' : ''}. solo, levels and endless have no cap.`,
    );
    this.g.ui.renderUpgrades(
      SYSTEMS.map((s) => {
        const tier = this.g.upgrades.tier(s.id);
        const check = this.g.upgrades.check(s.id, this.g.wallet.credits, this.g.leagues.league);
        const next = Math.min(MAX_TIER, tier + 1);
        return {
          id: s.id,
          name: s.name,
          effect: tier >= MAX_TIER ? s.effect(tier) : `next: ${s.effect(next)}`,
          tier,
          max: MAX_TIER,
          button: check.ok ? formatScore(TIER_COST[tier]) : check.reason,
          canBuy: check.ok,
          on: tier > 0 ? this.g.upgrades.isOn(s.id) : null,
        };
      }),
    );
  }
}
