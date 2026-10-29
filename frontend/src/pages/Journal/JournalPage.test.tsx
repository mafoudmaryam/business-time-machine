import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { celebrate } from "../../lib/celebrate";
import { App } from "../../App";
import { JournalPage } from "./JournalPage";
import { UndoProvider } from "../../components/UndoProvider";
import { track } from "../../lib/events";
import { rememberBusiness } from "../../lib/session";
import { makeJournal, makeJournalMonth, makeToday } from "../../test-fixtures";

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual, getJournal: vi.fn(), saveJournalEntry: vi.fn(), deleteJournalEntry: vi.fn(), restoreJournalEntry: vi.fn(),
    getToday: vi.fn(), getTodayNote: vi.fn(), getBusinessImpact: vi.fn(),
  };
});
vi.mock("../../lib/events", () => ({ track: vi.fn() }));
vi.mock("../../lib/celebrate", () => ({ celebrate: vi.fn(), prefersReducedMotion: () => false }));
vi.mock("../Today/TodayChart", () => ({ TodayChart: () => <p>The chart</p> }));

function mount(path = "/journal") {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <App />
      </UndoProvider>
    </MemoryRouter>,
  );
  return { user, ...view };
}

const box = (name: RegExp) => screen.getByRole("textbox", { name });

const NOV = { month: "2026-11", month_label: "November 2026" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 11, 10, 9, 0, 0));
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("btm.tourSeen", "1");
  rememberBusiness(1);
  vi.mocked(api.getJournal).mockResolvedValue(makeJournal());
  vi.mocked(api.getBusinessImpact).mockResolvedValue({ scenarios: 1, runs: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

async function ready() { await screen.findByRole('heading', {level:1,name:'How did this month go?'}); }
async function optional(user: ReturnType<typeof userEvent.setup>) { await user.click(screen.getByText('Optional cash balance, visits and notes')); }
async function fill(user: ReturnType<typeof userEvent.setup>, sales='10000', costs='7000') {
  if(sales) await user.type(box(/Sales money earned/),sales);
  if(costs) await user.type(box(/Costs incurred/),costs);
}
function actualMonth(complete=true) {
  const m=makeJournalMonth();
  Object.assign(m.entry,{actual_sales:10000,actual_costs:7000,costs_complete:complete,actual_profit:complete?3000:null,recorded_remaining:3000,actual_cash:null,actual_visits:null});
  m.currency='EUR';
  m.comparison_plan={month:m.entry.month,currency:'EUR',source:'saved',available:true,name:'Overview plan — changing nothing',run_id:17,made_at:'2026-10-15T09:00:00',bands:{profit:{p10:1000,p50:4000,p90:5000},revenue:{p10:8000,p50:9000,p90:11000}}};
  m.comparisons=complete?[{metric:'profit',actual:3000,expected_low:1000,expected:4000,expected_high:5000,difference:-1000,percent_difference:-25,position:'inside',sentence:'Recorded profit was below the saved middle estimate.'}]:[];
  m.summary=complete?'Recorded profit was below the saved middle estimate.':'Sales were recorded. Costs are incomplete.';
  return m;
}

describe('Track results using the existing journal',()=>{
  it('starts with one recording action, familiar labels and no celebration or pilot badge',async()=>{
    mount(); await ready();
    expect(screen.queryByText('Pilot feature')).toBeNull();
    expect(screen.getByRole('button',{name:'Save this month'})).toBeTruthy();
    expect(box(/Sales money earned/).getAttribute('value')).toBe('');
    expect(box(/Costs incurred/).getAttribute('value')).toBe('');
    expect(screen.getByRole('textbox',{name:/Month-end cash/}).closest('details')?.open).toBe(false);
    expect(screen.getByText(/Leave unknown amounts blank/)).toBeTruthy();
    expect(celebrate).not.toHaveBeenCalled();
  });
  it('redirects without a selected business',async()=>{
    window.sessionStorage.clear();mount();await waitFor(()=>expect(api.getJournal).not.toHaveBeenCalled());
  });
  it('saves sales and complete costs without inventing cash, visits or client-calculated profit',async()=>{
    const saved=actualMonth(); vi.mocked(api.saveJournalEntry).mockResolvedValue(saved);
    vi.mocked(api.getJournal).mockResolvedValueOnce(makeJournal()).mockResolvedValue(makeJournal({entries:[saved]}));
    const {user}=mount();await ready();await fill(user);await user.click(screen.getByRole('checkbox',{name:/all costs/}));
    await user.click(screen.getByRole('button',{name:'Save this month'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalledWith(1,{month:'2026-11',actual_sales:10000,actual_costs:7000,costs_complete:true,actual_profit:null,actual_cash:null,actual_visits:null,note:null}));
    expect(await screen.findByText('Saved November 2026.')).toBeTruthy();
    expect(await screen.findByRole('table')).toBeTruthy();expect(celebrate).not.toHaveBeenCalled();
  });
  it('allows a partial month and preserves unknown amounts',async()=>{
    vi.mocked(api.saveJournalEntry).mockResolvedValue(actualMonth(false));const {user}=mount();await ready();await fill(user,'100','');
    await user.click(screen.getByRole('button',{name:'Save this month'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalled());
    expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({actual_sales:100,actual_costs:null,actual_profit:null,costs_complete:false});
  });
  it('requires an explicit figure rather than turning blank inputs into zero',async()=>{
    const {user}=mount();await ready();await user.click(screen.getByRole('button',{name:'Save this month'}));
    expect(screen.getByRole('alert').textContent).toMatch(/at least one actual figure/);expect(api.saveJournalEntry).not.toHaveBeenCalled();
  });
  it('accepts explicit zero',async()=>{
    vi.mocked(api.saveJournalEntry).mockResolvedValue(actualMonth());const {user}=mount();await ready();await fill(user,'0','0');await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button',{name:'Save this month'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalled());expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({actual_sales:0,actual_costs:0});
  });
  it.each(['-1','5,2','Infinity','1e14'])('rejects invalid sales %s and focuses the input',async value=>{
    const {user}=mount();await ready();await fill(user,value,'20');await user.click(screen.getByRole('button',{name:'Save this month'}));
    expect(api.saveJournalEntry).not.toHaveBeenCalled();expect(document.activeElement).toBe(box(/Sales money earned/));expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('cannot confirm complete costs without sales and costs',async()=>{
    const {user}=mount();await ready();await fill(user,'100','');await user.click(screen.getByRole('checkbox'));await user.click(screen.getByRole('button',{name:'Save this month'}));
    expect(screen.getByRole('alert').textContent).toMatch(/both sales and costs/);expect(api.saveJournalEntry).not.toHaveBeenCalled();
  });
  it('shows the saved currency, same-month expected, actual and difference',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[actualMonth()]}));mount();await ready();
    const table=screen.getByRole('table');expect(table.textContent).toContain('November 2026');
    const row=within(table).getByRole('row',{name:/Profit or loss/});expect(row.textContent).toContain('€4,000');expect(row.textContent).toContain('€3,000');expect(row.textContent).toContain('-€1,000');
    expect(screen.getByText('No separate cost estimate')).toBeTruthy();expect(screen.getByRole('link',{name:'Review current assumptions'}).getAttribute('href')).toBe('/today#assumed');
  });
  it('keeps actual cents visible rather than rounding them into a different result',async()=>{
    const m=actualMonth();m.entry.actual_sales=10000.35;m.entry.actual_costs=7000.12;m.entry.actual_profit=3000.23;
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[m]}));mount();await ready();
    expect(screen.getAllByText('€10,000.35').length).toBeGreaterThan(0);expect(screen.getAllByText('€3,000.23').length).toBeGreaterThan(0);
  });
  it('does not label a partial-cost balance profit or invent cash flow',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[actualMonth(false)]}));const {user}=mount();await ready();
    expect(screen.getByText('Balance before unrecorded costs')).toBeTruthy();expect(screen.getByText(/The balance is not profit/)).toBeTruthy();
    await user.click(screen.getByText('Comparison plan and recording details'));
    expect(screen.getByText(/cash flow cannot be calculated/)).toBeTruthy();expect(screen.getByText(/not guarantees or real-world success probabilities/)).toBeTruthy();
  });
  it('preserves legacy reported profit without pretending sales and costs are known',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[makeJournalMonth()]}));mount();await ready();
    expect(screen.getByText('Reported profit or loss')).toBeTruthy();expect(screen.getByText(/cannot check what was included/)).toBeTruthy();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(1);
  });
  it('corrects an older record in its original currency',async()=>{
    const old=actualMonth();old.entry.month='2020-01';old.entry.month_label='January 2020';
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({currency:'USD',entries:[old]}));vi.mocked(api.saveJournalEntry).mockResolvedValue(old);
    const {user}=mount();await ready();await user.click(screen.getByRole('button',{name:'Edit January 2020'}));
    expect((screen.getByLabelText('Which month?') as HTMLSelectElement).value).toBe('2020-01');
    expect(screen.getByLabelText('Sales money earned (EUR)')).toBeTruthy();
    await user.clear(box(/Costs incurred/));await user.type(box(/Costs incurred/),'8000');await user.click(screen.getByRole('button',{name:'Save changes'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalled());expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({month:'2020-01',actual_costs:8000,actual_profit:null});
  });
  it('retains the legacy reported profit, cash and visits during a correction',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[makeJournalMonth()]}));vi.mocked(api.saveJournalEntry).mockResolvedValue(makeJournalMonth());
    const {user}=mount();await ready();await user.click(screen.getByRole('button',{name:'Edit November 2026'}));await optional(user);
    expect((box(/Reported profit/) as HTMLInputElement).value).toBe('5900');await user.clear(box(/Reported profit/));await user.type(box(/Reported profit/),'-400');await user.click(screen.getByRole('button',{name:'Save changes'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalled());expect(vi.mocked(api.saveJournalEntry).mock.calls[0][1]).toMatchObject({actual_profit:-400,actual_cash:52000,actual_visits:4300});
  });
  it('retains inputs after failure and permits retry without celebration',async()=>{
    vi.mocked(api.saveJournalEntry).mockRejectedValueOnce(new Error('private stack')).mockResolvedValue(actualMonth());const {user}=mount();await ready();await fill(user);
    await user.click(screen.getByRole('button',{name:'Save this month'}));expect(await screen.findByRole('alert')).toBeTruthy();expect((box(/Sales money earned/) as HTMLInputElement).value).toBe('10000');
    expect(screen.getByRole('alert').textContent).not.toContain('private stack');await user.click(screen.getByRole('button',{name:'Save this month'}));await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalledTimes(2));expect(celebrate).not.toHaveBeenCalled();
  });
  it('keeps the form disabled while saving and does not send duplicate records',async()=>{
    vi.mocked(api.saveJournalEntry).mockReturnValue(new Promise(()=>{}));const {user}=mount();await ready();await fill(user);
    await user.click(screen.getByRole('button',{name:'Save this month'}));expect((screen.getByRole('button',{name:'Saving…'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Which month?') as HTMLSelectElement).disabled).toBe(true);expect(api.saveJournalEntry).toHaveBeenCalledTimes(1);
  });
  it('keeps history optional and lets an owner record a missing month',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({due:[{month:'2026-10',month_label:'October 2026'}]}));const {user}=mount();await ready();
    expect(screen.getByRole('button',{name:'Record October 2026'}).closest('details')?.open).toBe(false);await user.click(screen.getByText('History and missing months'));await user.click(screen.getByRole('button',{name:'Record October 2026'}));
    expect((screen.getByLabelText('Which month?') as HTMLSelectElement).value).toBe('2026-10');expect(screen.getByText(/missing figure or month means unknown/)).toBeTruthy();
  });
  it('does not show another month’s old summary when selecting an unrecorded month',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[actualMonth()]}));const {user}=mount();await ready();
    expect(screen.getByRole('table')).toBeTruthy();await user.selectOptions(screen.getByLabelText('Which month?'),'2026-10');
    expect(within(screen.getByRole('region',{name:'Your month at a glance'})).queryByRole('table')).toBeNull();expect(screen.getByText('No figures recorded for October 2026. Use the form above to record this month.')).toBeTruthy();
  });
  it('hides a mixed-currency chart while retaining each monthly currency',async()=>{
    const j=makeJournal({currency:'USD',entries:[actualMonth()]});j.forecast={run_id:17,months:[{month:'2026-11',month_label:'November 2026',p10:1,p50:2,p90:3}]};
    vi.mocked(api.getJournal).mockResolvedValue(j);const {user}=mount();await ready();await user.click(screen.getByText('History and missing months'));
    expect(screen.getByText(/chart is hidden because these records use different currencies/)).toBeTruthy();expect(screen.queryByText('Compare recorded profit with the estimate')).toBeNull();
  });
  it('ignores the previous business response after switching businesses',async()=>{
    let resolveOld!: (value: api.JournalOut)=>void;
    vi.mocked(api.getJournal).mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue(makeJournal({business_id:2}));
    const tree=()=> <MemoryRouter><UndoProvider><JournalPage /></UndoProvider></MemoryRouter>;
    const view=render(tree());rememberBusiness(2);view.rerender(tree());await ready();
    resolveOld(makeJournal({business_id:1,entries:[actualMonth()]}));await waitFor(()=>expect(api.getJournal).toHaveBeenCalledWith(2));
    expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByRole('heading',{level:3,name:'November 2026'})).toBeNull();
  });
  it('loads a month from the existing URL',async()=>{
    mount('/journal?month=2026-08');await ready();expect((screen.getByLabelText('Which month?') as HTMLSelectElement).value).toBe('2026-08');
  });
  it('records only the fact of saving in telemetry, never financial inputs',async()=>{
    vi.mocked(api.saveJournalEntry).mockResolvedValue(actualMonth());const {user}=mount();await ready();await fill(user);await optional(user);await user.type(screen.getByLabelText(/A note for yourself/),'private words');await user.click(screen.getByRole('button',{name:'Save this month'}));
    await waitFor(()=>expect(api.saveJournalEntry).toHaveBeenCalled());expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(/private words|10000|7000/);
  });
  it('keeps Delete confirmation and Undo on the same journal record',async()=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:[makeJournalMonth()]}));vi.mocked(api.deleteJournalEntry).mockResolvedValue({id:1,kind:'journal',name:'November 2026',deleted_at:'2026-12-10T10:00:00'});vi.mocked(api.restoreJournalEntry).mockResolvedValue(makeJournalMonth());
    const {user}=mount();await ready();await user.click(screen.getByRole('button',{name:'Delete November 2026'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}));expect(api.deleteJournalEntry).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Delete November 2026'}));await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Delete'}));
    await waitFor(()=>expect(api.deleteJournalEntry).toHaveBeenCalledWith(1,'2026-11'));await user.click(await screen.findByRole('button',{name:'Undo'}));await waitFor(()=>expect(api.restoreJournalEntry).toHaveBeenCalledWith(1,'2026-11'));
  });
  it('shows a friendly load error and retries',async()=>{
    vi.mocked(api.getJournal).mockRejectedValueOnce(new api.ApiError(500,'sqlite private')).mockResolvedValue(makeJournal());const {user}=mount();expect(await screen.findByRole('alert')).toBeTruthy();await user.click(screen.getByRole('button',{name:'Try again'}));await ready();
  });
  it.each([false,true])('has no automatic accessibility violations with recorded results=%s',async hasResults=>{
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({entries:hasResults?[actualMonth(false)]:[]}));const {container,user}=mount();await ready();await optional(user);
    if(hasResults) await user.click(screen.getByText('Comparison plan and recording details'));
    expect((await axe(container)).violations).toEqual([]);
  });
  it('supports keyboard recording and focuses invalid fields',async()=>{
    const {user}=mount();await ready();screen.getByLabelText('Which month?').focus();await user.tab();expect(document.activeElement).toBe(box(/Sales money earned/));await user.keyboard('5,2');await user.tab();await user.keyboard('20');await user.tab();await user.keyboard(' ');
    await user.click(screen.getByRole('button',{name:'Save this month'}));expect(document.activeElement).toBe(box(/Sales money earned/));
  });
});
describe("the prompt on Today", () => {
  beforeEach(() => {
    vi.mocked(api.getToday).mockResolvedValue(makeToday());
    vi.mocked(api.getTodayNote).mockResolvedValue(makeToday().note!);
  });

  it("says last month is missing, and links to the journal on that month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [NOV] }));
    mount("/today");
    const link = await screen.findByRole("link", { name: "Write it down" });
    expect(link.getAttribute("href")).toBe("/journal?month=2026-11");
    expect(screen.getByText("Last month isn't in your journal yet.")).toBeTruthy();
  });

  it("can be dismissed, and then stays away for that month", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [NOV] }));
    const first = mount("/today");
    await first.user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
    first.unmount();
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(api.getJournal).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
  });

  it("only mentions last month, never an older one", async () => {
    vi.mocked(api.getJournal).mockResolvedValue(makeJournal({ due: [{ month: "2026-10", month_label: "October 2026" }] }));
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/isn't in your journal yet/)).toBeNull();
  });

  it("says nothing when no month is waiting", async () => {
    mount("/today");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText(/in your journal yet/)).toBeNull();
  });

  it("says nothing, and still works, when the journal cannot be read", async () => {
    vi.mocked(api.getJournal).mockRejectedValue(new Error("down"));
    mount("/today");
    expect(await screen.findByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByText(/in your journal yet/)).toBeNull();
  });

  it("always has a link to the journal", async () => {
    mount("/today");
    expect((await screen.findByRole("link", { name: "Track results" })).getAttribute("href")).toBe("/journal");
  });
});
