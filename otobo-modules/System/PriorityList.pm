# --
# OTOBO is a web-based ticketing system for service organisations.
# --
# Copyright (C) 2019-2025 Rother OSS GmbH, https://otobo.io/
# --
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later version.
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.
# --

package Kernel::GenericInterface::Operation::System::PriorityList;

use strict;
use warnings;

use parent qw(
    Kernel::GenericInterface::Operation::Common
    Kernel::GenericInterface::Operation::System::Common
);

our $ObjectManagerDisabled = 1;

=head1 NAME

Kernel::GenericInterface::Operation::System::PriorityList - GenericInterface Priority List Operation backend

=head1 PUBLIC INTERFACE

=head2 new()

usually, you want to create an instance of this
by using Kernel::GenericInterface::Operation->new();

=cut

sub new {
    my ( $Type, %Param ) = @_;

    my $Self = {};
    bless( $Self, $Type );

    # check needed objects
    for my $Needed (qw(DebuggerObject WebserviceID)) {
        if ( !$Param{$Needed} ) {
            return {
                Success      => 0,
                ErrorMessage => "Got no $Needed!",
            };
        }

        $Self->{$Needed} = $Param{$Needed};
    }

    return $Self;
}

=head2 Run()

perform PriorityList Operation. Returns all available ticket priorities.

    my $Result = $OperationObject->Run(
        Data => {
            UserLogin         => 'some agent login',        # UserLogin or SessionID is required
            SessionID         => 123,
            Password          => 'some password',           # if UserLogin is sent then Password is required
            Valid             => 1,                         # optional, default 1 (only valid priorities)
        },
    );

    $Result = {
        Success      => 1,                                  # 0 or 1
        ErrorMessage => '',                                 # In case of an error
        Data         => {
            Priority => [
                {
                    PriorityID => 1,
                    Name       => '1 very low',
                },
                {
                    PriorityID => 2,
                    Name       => '2 low',
                },
                {
                    PriorityID => 3,
                    Name       => '3 normal',
                },
                # ... more priorities
            ]
        },
    };

=cut

sub Run {
    my ( $Self, %Param ) = @_;

    my $Result = $Self->Init(
        WebserviceID => $Self->{WebserviceID},
    );

    if ( !$Result->{Success} ) {
        return $Self->ReturnError(
            ErrorCode    => 'Webservice.InvalidConfiguration',
            ErrorMessage => $Result->{ErrorMessage},
        );
    }

    # Authenticate user
    my ( $UserID, $UserType ) = $Self->Auth(
        %Param,
    );

    return $Self->ReturnError(
        ErrorCode    => 'PriorityList.AuthFail',
        ErrorMessage => "PriorityList: Authorization failing!",
    ) if !$UserID;

    my $PriorityObject = $Kernel::OM->Get('Kernel::System::Priority');

    # Get valid parameter
    my $Valid = $Param{Data}->{Valid} // 1;

    # Get all priorities
    my %Priorities = $PriorityObject->PriorityList(
        Valid => $Valid,
    );

    # Build result array
    my @PriorityList;
    for my $PriorityID ( sort { $a <=> $b } keys %Priorities ) {
        push @PriorityList, {
            PriorityID => $PriorityID,
            Name       => $Priorities{$PriorityID},
        };
    }

    # Return results
    return {
        Success => 1,
        Data    => {
            Priority => \@PriorityList,
        },
    };
}

1;

=head1 TERMS AND CONDITIONS

This software comes with ABSOLUTELY NO WARRANTY. For details, see
the enclosed file COPYING for license information (GPL). If you
did not receive this file, see L<https://www.gnu.org/licenses/gpl-3.0.txt>.

=cut
