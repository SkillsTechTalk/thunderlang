// The demo and its download use this exact source. No canned verdicts.
export const STARTER_CONTRACT = `mission RefundReview

goal
  Automatically approve eligible refunds up to 100 dollars.

guarantee the refund boundary behaves as declared
  verify test RefundPolicy

decision RefundPolicy
  inputs
    amount
    withinWindow
  rule eligible
    when amount <= 100 and amount >= 0 and withinWindow == true
    return Approve
  default
    return Review

test RefundPolicy
  case below the limit
    given amount 99, withinWindow true
    expect Approve
  case exactly at the limit
    given amount 100, withinWindow true
    expect Approve
  case above the limit
    given amount 101, withinWindow true
    expect Review
  case outside the refund window
    given amount 50, withinWindow false
    expect Review
  case negative amount
    given amount -1, withinWindow true
    expect Review
`;
export function starterContract(broken: boolean) {
  return broken
    ? STARTER_CONTRACT.replace("amount <= 100", "amount < 100")
    : STARTER_CONTRACT;
}
