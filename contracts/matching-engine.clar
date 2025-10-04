(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-SUBJECT u101)
(define-constant ERR-INVALID-LEVEL u102)
(define-constant ERR-INVALID-AVAILABILITY u103)
(define-constant ERR-INVALID-LOCATION u104)
(define-constant ERR-INVALID-REPUTATION u105)
(define-constant ERR-REQUEST-ALREADY-MATCHED u106)
(define-constant ERR-NO-MATCHES-FOUND u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-INVALID-PROPOSAL u109)
(define-constant ERR-PROPOSAL-EXPIRED u110)
(define-constant ERR-INVALID-MATCH-CRITERIA u111)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u112)
(define-constant ERR-INVALID-USER u113)
(define-constant ERR-INVALID-TUTOR u114)
(define-constant ERR-INVALID-STUDENT u115)
(define-constant ERR-MATCH-ALREADY-EXISTS u116)
(define-constant ERR-INVALID-DISTANCE u117)
(define-constant ERR-INVALID-RATING u118)
(define-constant ERR-INVALID-STATUS u119)
(define-constant ERR-AUTHORITY-NOT-SET u120)

(define-data-var next-match-id uint u0)
(define-data-var max-proposals-per-request uint u10)
(define-data-var proposal-expiry uint u144)
(define-data-var authority-contract (optional principal) none)

(define-map match-proposals
  { request-id: uint }
  (list 10 { tutor: principal, score: uint, timestamp: uint })
)

(define-map active-matches
  { match-id: uint }
  { request-id: uint, tutor: principal, student: principal, subject: (string-ascii 50), level: uint, timestamp: uint, status: bool }
)

(define-map request-status
  { request-id: uint }
  { matched: bool, timestamp: uint }
)

(define-read-only (get-match-proposals (request-id uint))
  (map-get? match-proposals { request-id: request-id })
)

(define-read-only (get-active-match (match-id uint))
  (map-get? active-matches { match-id: match-id })
)

(define-read-only (get-request-status (request-id uint))
  (map-get? request-status { request-id: request-id })
)

(define-private (validate-subject (subject (string-ascii 50)))
  (if (and (> (len subject) u0) (<= (len subject) u50))
      (ok true)
      (err ERR-INVALID-SUBJECT))
)

(define-private (validate-level (level uint))
  (if (and (>= level u1) (<= level u12))
      (ok true)
      (err ERR-INVALID-LEVEL))
)

(define-private (validate-availability (availability uint))
  (if (> availability u0)
      (ok true)
      (err ERR-INVALID-AVAILABILITY))
)

(define-private (validate-location (location (string-ascii 100)))
  (if (and (> (len location) u0) (<= (len location) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-reputation (reputation uint))
  (if (>= reputation u50)
      (ok true)
      (err ERR-INVALID-REPUTATION))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-distance (distance uint))
  (if (<= distance u50)
      (ok true)
      (err ERR-INVALID-DISTANCE))
)

(define-private (validate-rating (rating uint))
  (if (and (>= rating u1) (<= rating u5))
      (ok true)
      (err ERR-INVALID-RATING))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-proposals (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-MAX-PROPOSALS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set max-proposals-per-request new-max)
    (ok true)
  )
)

(define-public (set-proposal-expiry (new-expiry uint))
  (begin
    (asserts! (> new-expiry u0) (err ERR-INVALID-PROPOSAL))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-SET))
    (var-set proposal-expiry new-expiry)
    (ok true)
  )
)

(define-public (propose-match (request-id uint) (tutor principal) (score uint) (subject (string-ascii 50)) (level uint))
  (let ((proposals (default-to (list) (get-match-proposals request-id)))
        (status (unwrap! (get-request-status request-id) (err ERR-INVALID-REQUEST))))
    (asserts! (not (get matched status)) (err ERR-REQUEST-ALREADY-MATCHED))
    (try! (validate-subject subject))
    (try! (validate-level level))
    (try! (validate-reputation score))
    (asserts! (< (len proposals) (var-get max-proposals-per-request)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (map-set match-proposals { request-id: request-id }
      (unwrap! (as-max-len? (append proposals { tutor: tutor, score: score, timestamp: block-height }) u10) (err ERR-MAX-PROPOSALS-EXCEEDED)))
    (print { event: "match-proposed", request-id: request-id, tutor: tutor })
    (ok true)
  )
)

(define-public (accept-match (request-id uint) (tutor principal) (student principal) (subject (string-ascii 50)) (level uint))
  (let ((proposals (unwrap! (get-match-proposals request-id) (err ERR-NO-MATCHES-FOUND)))
        (next-id (var-get next-match-id))
        (status (unwrap! (get-request-status request-id) (err ERR-INVALID-REQUEST))))
    (asserts! (not (get matched status)) (err ERR-REQUEST-ALREADY-MATCHED))
    (asserts! (is-some (index-of? (map get-tutor proposals) tutor)) (err ERR-INVALID-PROPOSAL))
    (try! (validate-subject subject))
    (try! (validate-level level))
    (map-set active-matches { match-id: next-id }
      { request-id: request-id, tutor: tutor, student: student, subject: subject, level: level, timestamp: block-height, status: true })
    (map-set request-status { request-id: request-id } { matched: true, timestamp: block-height })
    (var-set next-match-id (+ next-id u1))
    (print { event: "match-accepted", match-id: next-id })
    (ok next-id)
  )
)

(define-public (get-best-match (request-id uint))
  (let ((proposals (default-to (list) (get-match-proposals request-id))))
    (fold find-highest-score proposals { tutor: none, score: u0 })
  )
)

(define-private (find-highest-score (proposal { tutor: principal, score: uint, timestamp: uint }) (best { tutor: (optional principal), score: uint }))
  (if (> (get score proposal) (get score best))
      { tutor: (some (get tutor proposal)), score: (get score proposal) }
      best)
)

(define-public (expire-proposals (request-id uint))
  (let ((proposals (default-to (list) (get-match-proposals request-id))))
    (map-set match-proposals { request-id: request-id }
      (filter is-not-expired proposals))
    (ok true)
  )
)

(define-private (is-not-expired (proposal { tutor: principal, score: uint, timestamp: uint }))
  (< (- block-height (get timestamp proposal)) (var-get proposal-expiry))
)

(define-public (get-match-count)
  (ok (var-get next-match-id))
)