/*
 * Demo bills as raw CSV text. They go through the same parser as uploaded files.
 * Exposes window.BillDemos.
 */
(function (global) {
  'use strict';

  const csv = (...rows) => `${['service,quantity,unit_price', ...rows].join('\n')}\n`;

  const headlineAfter = csv('Compute,160,1', 'Storage,50,1.4', 'Support,180,1');

  global.BillDemos = Object.freeze([
    {
      id: 'headline',
      label: 'Headline',
      blurb: 'Every Bucket moves',
      before: { name: 'before.csv', text: csv('Compute,100,1', 'Storage,50,1', 'Legacy,20,1') },
      after: { name: 'after.csv', text: headlineAfter },
    },
    {
      id: 'rounding',
      label: 'Rounding',
      blurb: 'Sub-cent effects',
      before: { name: 'before.csv', text: csv('Alpha,1,100', 'Beta,100,1') },
      after: { name: 'after.csv', text: csv('Alpha,1.00004,100', 'Beta,100,1.00004') },
    },
    {
      id: 'invalid',
      label: 'Invalid',
      blurb: 'Errors by Source line',
      before: { name: 'before.csv', text: csv('Compute,100,1', 'Storage,50,oops', 'Support,10,1', 'Support,12,1') },
      after: { name: 'after.csv', text: headlineAfter },
    },
    {
      id: 'opposing',
      label: 'Opposing',
      blurb: 'A zero-total Bucket',
      before: { name: 'before.csv', text: csv('Compute,200,1', 'Storage,300,1', 'Support,40,2.5') },
      after: { name: 'after.csv', text: csv('Compute,300,1', 'Storage,200,1', 'Support,40,2.5') },
    },
  ]);
})(window);
