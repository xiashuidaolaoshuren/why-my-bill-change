# Bill change

Explains the difference between two periods of a bill by attributing that difference to services and effects that reconcile exactly to the total change.

## Language

**Bill**:
One period's charges, supplied as a single file. Every amount is in Hong Kong dollars.
_Avoid_: Invoice, account, export, statement

**Service**:
A named billable item within a bill. The same service name in both bills means the same item measured in the same quantity unit.
_Avoid_: Row, line item, SKU, product

**Quantity unit**:
The measurement of a service's quantity, such as hours or gigabytes. It is part of the service's identity and is assumed to stay the same across both bills.
_Avoid_: Unit price, currency

**Cost**:
A service's quantity multiplied by its unit price.
_Avoid_: Price, amount, charge

**Comparison**:
The attribution of the total change between a before bill and an after bill.
_Avoid_: Diff, report, analysis

**Total change**:
The after cost minus the before cost, for one service or for a whole bill.
_Avoid_: Delta, variance, difference

**Usage effect**:
The portion of a changed service's total change attributed to its quantity change, valued at the before-period unit price.
_Avoid_: Volume, quantity delta

**Price effect**:
The portion of a changed service's total change attributed to its unit-price change, valued at the after-period quantity.
_Avoid_: Rate change, price delta

**Bucket**:
One of the four parts of a bill's total change: added, removed, usage, or price.
_Avoid_: Category, series, group

**Contributor**:
A service whose effect in a bucket is non-zero.
_Avoid_: Changed row, line

**Bucket contribution**:
A service's effect inside one bucket. Its sign and size can differ from that service's total change.
_Avoid_: Total change

**Reconciliation**:
The exact identity that the before total plus the four buckets equals the after total.
_Avoid_: Balance check, checksum

**Added**:
A service present only in the after bill.
_Avoid_: New, inserted

**Removed**:
A service present only in the before bill.
_Avoid_: Deleted, missing

**Changed**:
A service present in both bills whose quantity or unit price differs.
_Avoid_: Updated, modified

**Unchanged**:
A service present in both bills with the same quantity and unit price.
_Avoid_: Stable, identical

**Source line**:
The physical line in a bill file that supplied a service's values.
_Avoid_: Row index, record number
