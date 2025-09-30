import { HttpClient } from '@angular/common/http';
import { GridOptions, ColDef } from '@ag-grid-community/core';
import { Injectable, inject } from '@angular/core';
import { NW_FALLBACK_ICON, getItemId, getItemPerkBucketIds, getItemPerks, getItemTypeLabel } from '@nw-data/common';
import {
  COLS_CONSUMABLEITEMDEFINITIONS,
  COLS_MASTERITEMDEFINITIONS,
  CategoricalProgressionData,
  MasterItemDefinitions,
} from '@nw-data/generated';
import { injectNwData } from '~/data';
import { TranslateService } from '~/i18n';
import { TableGridUtils } from '~/ui/data/table-grid';

import { uniq } from 'lodash';
import { combineLatest, defer, map, of } from 'rxjs';
import { DataViewAdapter, injectDataViewAdapterOptions } from '~/ui/data/data-view';
import { DataTableCategory, addGenericColumns } from '~/ui/data/table-grid';
import { VirtualGridOptions } from '~/ui/data/virtual-grid';
import { humanize, selectStream } from '~/utils';
import {
  ItemTableRecord,
  itemColIcon,
  itemColName,
  itemColItemId,
  itemColPerks,
  itemColRarity,
  itemColTier,
  itemColItemTypeName,
  itemColGearScore,
  itemColSource,
  itemColEvent,
  itemColExpansion,
} from '../item-table/item-table-cols';

// Define interfaces for the auction and buy order data
export interface AukcjeData {
  item_id: string;
  price: number;
  availability: number;
}

export interface KupnoData {
  item_id: string;
  price: number;
  availability: number;
}

// Extend ItemTableRecord to include new data
export interface FaktoriaTableRecord extends ItemTableRecord {
  $aukcje?: AukcjeData;
  $kupno?: KupnoData;
}

// New column definitions
export function faktoriaColAukcjePrice(util: TableGridUtils<FaktoriaTableRecord>): ColDef<FaktoriaTableRecord> {
  return util.colDef({
    colId: 'aukcjePrice',
    headerValueGetter: () => 'Aukcje Price',
    valueGetter: ({ data }) => data?.$aukcje?.price,
    width: 120,
    cellClass: 'text-right',
    valueFormatter: ({ value }) => (typeof value === 'number' ? value.toFixed(2) : null),
  });
}

export function faktoriaColKupnoPrice(util: TableGridUtils<FaktoriaTableRecord>): ColDef<FaktoriaTableRecord> {
  return util.colDef({
    colId: 'kupnoPrice',
    headerValueGetter: () => 'Kupno Price',
    valueGetter: ({ data }) => data?.$kupno?.price,
    width: 120,
    cellClass: 'text-right',
    valueFormatter: ({ value }) => (typeof value === 'number' ? value.toFixed(2) : null),
  });
}

@Injectable()
export class FaktoriaTableAdapter implements DataViewAdapter<FaktoriaTableRecord> {
  private db = injectNwData();
  private i18n = inject(TranslateService);
  private http = inject(HttpClient);
  private config = injectDataViewAdapterOptions<FaktoriaTableRecord>({ optional: true });
  private utils: TableGridUtils<FaktoriaTableRecord> = inject(TableGridUtils);

  public entityID(item: FaktoriaTableRecord): string {
    return item.ItemID.toLowerCase();
  }

  public entityCategories(item: FaktoriaTableRecord): DataTableCategory[] {
    if (!item.ItemType) {
      return null;
    }
    return [
      {
        id: item.ItemType.toLowerCase(),
        label: this.i18n.get(getItemTypeLabel(item.ItemType)) || item.ItemType,
        icon: '',
      },
    ];
  }

  public virtualOptions(): VirtualGridOptions<FaktoriaTableRecord> {
    return null;
  }

  public gridOptions(): GridOptions<FaktoriaTableRecord> {
    if (this.config?.gridOptions) {
      return this.config.gridOptions(this.utils);
    }
    return buildCommonItemGridOptions(this.utils);
  }

  public connect() {
    return this.source$;
  }

  private source$ = selectStream(
    defer(() =>
      combineLatest({
        items: this.config?.source || this.db.itemsAll(),
        itemsMap: this.db.itemsByIdMap(),
        housingMap: this.db.housingItemsByIdMap(),
        perksMap: this.db.perksByIdMap(),
        affixMap: this.db.affixStatsByIdMap(),
        transformsMap: this.db.itemTransformsByIdMap(),
        transformsMapReverse: this.db.itemTransformsByToItemIdMap(),
        conversionMap: this.db.itemCurrencyConversionByItemIdMap(),
        progressionMap: this.db.categoricalProgressionByIdMap(),
        consumablesMap: this.db.consumableItemsByIdMap(),
        aukcje: this.http.get<AukcjeData[]>('/dane-ai/2025-09-17_Aries-Aukcje-sample.json'),
        kupno: this.http.get<KupnoData[]>('/dane-ai/2025-09-17_Aries-Kupno-sample.json'),
      })
    ),
    ({
      items,
      itemsMap,
      housingMap,
      perksMap,
      affixMap,
      transformsMap,
      transformsMapReverse,
      conversionMap,
      progressionMap,
      consumablesMap,
      aukcje,
      kupno,
    }) => {
      const aukcjeMap = new Map(aukcje.map((it) => [it.item_id.toLowerCase(), it]));
      const kupnoMap = new Map(kupno.map((it) => [it.item_id.toLowerCase(), it]));

      function getItem(id: string) {
        if (!id) {
          return null;
        }
        return itemsMap.get(id) || housingMap.get(id) || ({ ItemID: id } as MasterItemDefinitions);
      }

      const result = items.map((it): FaktoriaTableRecord => {
        const perks = getItemPerks(it, perksMap);
        const conversions = conversionMap.get(getItemId(it)) || [];
        const shops = uniq(conversions.map((it) => it.CategoricalProgressionId)).map(
          (id): CategoricalProgressionData => {
            const result = progressionMap.get(id as any);
            if (result) {
              return result;
            }
            return {
              CategoricalProgressionId: id as any,
              DisplayName: humanize(id as any),
              IconPath: NW_FALLBACK_ICON,
            } as any;
          }
        );
        return {
          ...it,
          $perks: perks,
          $affixes: perks.map((it) => affixMap.get(it?.Affix)).filter((it) => !!it),
          $perkBuckets: getItemPerkBucketIds(it),
          $transformTo: getItem(transformsMap.get(it.ItemID)?.ToItemId),
          $transformFrom: (transformsMapReverse.get(it.ItemID) || []).map((it) => getItem(it.FromItemId)),
          $consumable: consumablesMap.get(it.ItemID),
          $conversions: conversions,
          $shops: shops,
          $aukcje: aukcjeMap.get(it.ItemID.toLowerCase()),
          $kupno: kupnoMap.get(it.ItemID.toLowerCase()),
        };
      });

      const filter = this.config?.filter;
      if (filter) {
        return result.filter(filter);
      }
      const sort = this.config?.sort;
      if (sort) {
        return [...result].sort(sort);
      }
      return result;
    }
  );
}

export function buildCommonItemGridOptions(util: TableGridUtils<FaktoriaTableRecord>) {
  const result: GridOptions<FaktoriaTableRecord> = {
    columnDefs: [
      itemColIcon(util),
      itemColName(util),
      faktoriaColAukcjePrice(util),
      faktoriaColKupnoPrice(util),
      itemColItemId(util),
      itemColPerks(util),
      itemColRarity(util),
      itemColTier(util),
      itemColItemTypeName(util),
      itemColGearScore(util),
      itemColSource(util),
      itemColEvent(util),
      itemColExpansion(util),
    ],
  };
  addGenericColumns(result, {
    props: COLS_MASTERITEMDEFINITIONS,
  });
  addGenericColumns(result, {
    props: COLS_CONSUMABLEITEMDEFINITIONS,
    scope: '$consumable',
  });
  return result;
}
